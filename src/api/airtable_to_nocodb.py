#!/usr/bin/env python3
# 從 Airtable 匯入機台/商品到 NocoDB（交易記錄不處理）
import json
import os
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone

AIRTABLE_BASE_ID = os.environ.get("AIRTABLE_BASE_ID", "").strip()
AIRTABLE_API_KEY = os.environ.get("AIRTABLE_API_KEY", "").strip()
NOCODB_BASE_URL = os.environ.get("NOCODB_BASE_URL", "").rstrip("/")
NOCODB_API_KEY = os.environ.get("NOCODB_API_KEY", "").strip()
NOCODB_PROJECT = os.environ.get("NOCODB_PROJECT", "zgovend").strip()
OPERATOR_CODE = os.environ.get("OPERATOR_CODE", "zgo").strip()
DRY_RUN = os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes")
USE_OPERATOR_LINK = os.environ.get("USE_OPERATOR_LINK", "").lower() in ("1", "true", "yes")

if not AIRTABLE_BASE_ID or not AIRTABLE_API_KEY:
    raise SystemExit("Missing env vars: AIRTABLE_BASE_ID, AIRTABLE_API_KEY")
if not NOCODB_BASE_URL or not NOCODB_API_KEY or not NOCODB_PROJECT:
    raise SystemExit("Missing env vars: NOCODB_BASE_URL, NOCODB_API_KEY, NOCODB_PROJECT")

AT_HEADERS = {"Authorization": f"Bearer {AIRTABLE_API_KEY}"}
NC_HEADERS = {"xc-token": NOCODB_API_KEY, "Content-Type": "application/json"}


def http_get(url, headers, retries=4):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def http_post(url, headers, payload, retries=2):
    data = json.dumps(payload).encode("utf-8")
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers, data=data, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError:
            if i == retries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def airtable_meta_tables():
    url = f"https://api.airtable.com/v0/meta/bases/{AIRTABLE_BASE_ID}/tables"
    return http_get(url, AT_HEADERS)


def airtable_records(table_name):
    records = []
    offset = None
    while True:
        params = {"pageSize": 100}
        if offset:
            params["offset"] = offset
        url = (
            f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/"
            f"{urllib.parse.quote(table_name)}?{urllib.parse.urlencode(params)}"
        )
        data = http_get(url, AT_HEADERS)
        records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
    return records


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def pick_first(value):
    if isinstance(value, list):
        return value[0] if value else None
    return value


def extract_attachment_url(value):
    if isinstance(value, list) and value:
        item = value[0]
        if isinstance(item, dict):
            return item.get("url")
    return None


def load_linked_table_map(table_name, primary_field_name):
    recs = airtable_records(table_name)
    out = {}
    for r in recs:
        fields = r.get("fields", {})
        out[r["id"]] = fields.get(primary_field_name)
    return out


def load_store_info(table_name, primary_field_name):
    recs = airtable_records(table_name)
    out = {}
    for r in recs:
        f = r.get("fields", {})
        out[r["id"]] = {
            "name": f.get(primary_field_name),
            "address": f.get("地址"),
            "store_code": f.get("店號"),
        }
    return out


def list_nocodb(table, page_size=100):
    page = 1
    all_rows = []
    while True:
        url = (
            f"{NOCODB_BASE_URL}/api/v1/db/data/v1/{NOCODB_PROJECT}/"
            f"{urllib.parse.quote(table)}?page={page}&pageSize={page_size}"
        )
        data = http_get(url, NC_HEADERS)
        all_rows.extend(data.get("list", []))
        info = data.get("pageInfo", {})
        if info.get("isLastPage"):
            break
        page += 1
    return all_rows


def create_nocodb(table, record):
    if DRY_RUN:
        return {"dry_run": True}
    url = (
        f"{NOCODB_BASE_URL}/api/v1/db/data/v1/{NOCODB_PROJECT}/"
        f"{urllib.parse.quote(table)}"
    )
    return http_post(url, NC_HEADERS, record)


def max_int_id(rows):
    max_id = 0
    for r in rows:
        rid = r.get("id")
        if isinstance(rid, int) and rid > max_id:
            max_id = rid
    return max_id


def ensure_operator():
    rows = list_nocodb("operators")
    for r in rows:
        if r.get("code") == OPERATOR_CODE:
            return r.get("id") or r.get("Id")
    next_id = max_int_id(rows) + 1
    record = {
        "id": next_id,
        "code": OPERATOR_CODE,
        "name": OPERATOR_CODE,
        "status": "active",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    res = create_nocodb("operators", record)
    return res.get("id") or res.get("Id")


def main():
    meta = airtable_meta_tables()
    table_by_name = {t["name"]: t for t in meta.get("tables", [])}

    # Airtable linked maps
    model_table = table_by_name.get("型號")
    store_table = table_by_name.get("門市")
    product_table = table_by_name.get("商品")
    machine_table = table_by_name.get("販賣機")

    if not product_table or not machine_table:
        raise SystemExit("Airtable tables not found: 販賣機/商品")

    def primary_name(t):
        pid = t.get("primaryFieldId")
        for f in t.get("fields", []):
            if f.get("id") == pid:
                return f.get("name")
        return None

    model_primary = primary_name(model_table) if model_table else None
    store_primary = primary_name(store_table) if store_table else None

    model_map = load_linked_table_map("型號", model_primary) if model_primary else {}
    store_map = load_store_info("門市", store_primary) if store_primary else {}

    # NocoDB existing maps
    product_rows = list_nocodb("products")
    existing_products = {r.get("sku"): r for r in product_rows if r.get("sku")}
    next_product_id = max_int_id(product_rows) + 1
    existing_machines = {r.get("code"): r for r in list_nocodb("machines") if r.get("code")}

    operator_row_id = ensure_operator()

    # Import products
    created_products = 0
    updated_products = 0
    skipped_products = 0
    seen_skus = set()
    for r in airtable_records("商品"):
        f = r.get("fields", {})
        sku = f.get("商品編號") or r.get("id")
        name = f.get("商品名稱") or sku
        price = f.get("售價") or 0
        status = f.get("Status") or "active"
        created_at = r.get("createdTime") or now_iso()
        updated_at = f.get("modified") or created_at

        record = {
            "id": next_product_id,
            "operator_id": OPERATOR_CODE,
            "operator_link": [operator_row_id] if (USE_OPERATOR_LINK and operator_row_id) else None,
            "sku": sku,
            "name": name,
            "price": price,
            "status": status,
            "barcode": f.get("barcode"),
            "image_url": extract_attachment_url(f.get("商品圖檔")),
            "created_at": created_at,
            "updated_at": updated_at,
        }
        record = {k: v for k, v in record.items() if v is not None}

        if sku in existing_products:
            updated_products += 1
            continue
        if sku in seen_skus:
            skipped_products += 1
            continue
        create_nocodb("products", record)
        seen_skus.add(sku)
        next_product_id += 1
        created_products += 1

    # Import machines
    created_machines = 0
    updated_machines = 0
    skipped_machines = 0
    seen_codes = set()
    for r in airtable_records("販賣機"):
        f = r.get("fields", {})
        code = f.get("機號") or r.get("id")
        model_ids = f.get("型號") or []
        store_ids = f.get("所在門市") or []
        model_name = model_map.get(model_ids[0]) if model_ids else None
        store_info = store_map.get(store_ids[0]) if store_ids else {}

        last_beat = pick_first(f.get("最後心跳"))
        status = "active" if last_beat else "inactive"

        notes = {
            "hid": f.get("hid"),
            "heartbeats": f.get("心跳"),
            "temperature": f.get("溫度"),
            "today_revenue": f.get("今日營收"),
            "transactions": f.get("交易記錄"),
            "inventory": f.get("庫存"),
            "screenshot": f.get("畫面截圖"),
            "store_code": store_info.get("store_code"),
        }

        record = {
            "operator_id": OPERATOR_CODE,
            "operator_link": [operator_row_id] if (USE_OPERATOR_LINK and operator_row_id) else None,
            "code": code,
            "name": code,
            "type": model_name,
            "status": status,
            "area": store_info.get("name"),
            "address": store_info.get("address"),
            "last_sync_at": last_beat,
            "notes": json.dumps(notes, ensure_ascii=False),
            "created_at": r.get("createdTime") or now_iso(),
            "updated_at": last_beat or r.get("createdTime") or now_iso(),
        }
        record = {k: v for k, v in record.items() if v is not None}

        if code in existing_machines:
            updated_machines += 1
            continue
        if code in seen_codes:
            skipped_machines += 1
            continue
        create_nocodb("machines", record)
        seen_codes.add(code)
        created_machines += 1

    result = {
        "products": {
            "created": created_products,
            "skipped_existing": updated_products,
            "skipped_duplicate": skipped_products,
        },
        "machines": {
            "created": created_machines,
            "skipped_existing": updated_machines,
            "skipped_duplicate": skipped_machines,
        },
        "dry_run": DRY_RUN,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

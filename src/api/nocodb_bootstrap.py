#!/usr/bin/env python3
# 用於初始化 NocoDB table 與關聯（可重複執行）
import json
import os
import time
import urllib.request
import urllib.error

BASE_URL = os.environ.get("NOCODB_BASE_URL", "").rstrip("/")
API_KEY = os.environ.get("NOCODB_API_KEY", "")
PROJECT_ID = os.environ.get("NOCODB_PROJECT_ID", "")

if not BASE_URL or not API_KEY or not PROJECT_ID:
    raise SystemExit(
        "Missing env vars: NOCODB_BASE_URL, NOCODB_API_KEY, NOCODB_PROJECT_ID"
    )

HEADERS = {
    "xc-token": API_KEY,
    "Content-Type": "application/json",
}


def _sleep_retry(i):
    time.sleep(1.5 * (i + 1))


def http_get(path, retries=4):
    for i in range(retries):
        try:
            req = urllib.request.Request(BASE_URL + path, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            if i == retries - 1:
                raise
            _sleep_retry(i)


def http_post(path, payload, retries=2):
    data = json.dumps(payload).encode("utf-8")
    for i in range(retries):
        try:
            req = urllib.request.Request(
                BASE_URL + path, headers=HEADERS, data=data, method="POST"
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError:
            if i == retries - 1:
                raise
            _sleep_retry(i)


def col(name, uidt, rqd=False, unique=False):
    c = {"column_name": name, "title": name, "uidt": uidt}
    if rqd:
        c["rqd"] = 1
    if unique:
        c["unique"] = 1
    return c


SCHEMA = {
    "operators": [
        col("code", "SingleLineText", rqd=True, unique=True),
        col("name", "SingleLineText", rqd=True),
        col("status", "SingleLineText", rqd=True),
        col("contact_name", "SingleLineText"),
        col("contact_email", "Email"),
        col("contact_phone", "PhoneNumber"),
        col("notes", "LongText"),
        col("created_at", "DateTime", rqd=True),
        col("updated_at", "DateTime", rqd=True),
    ],
    "support_tickets": [
        col("operator_id", "SingleLineText"),
        col("user_id", "SingleLineText", rqd=True),
        col("category", "SingleLineText", rqd=True),
        col("subject", "SingleLineText"),
        col("description", "LongText", rqd=True),
        col("status", "SingleLineText", rqd=True),
        col("priority", "SingleLineText"),
        col("attachments", "LongText"),
        col("contact_channel", "SingleLineText"),
        col("created_at", "DateTime", rqd=True),
        col("updated_at", "DateTime", rqd=True),
        col("closed_at", "DateTime"),
    ],
    "products": [
        col("operator_id", "SingleLineText"),
        col("sku", "SingleLineText", rqd=True, unique=True),
        col("name", "SingleLineText", rqd=True),
        col("description", "LongText"),
        col("category", "SingleLineText"),
        col("barcode", "SingleLineText"),
        col("unit", "SingleLineText"),
        col("price", "Number", rqd=True),
        col("cost", "Number"),
        col("status", "SingleLineText", rqd=True),
        col("image_url", "SingleLineText"),
        col("tags", "LongText"),
        col("created_at", "DateTime", rqd=True),
        col("updated_at", "DateTime", rqd=True),
    ],
    "machines": [
        col("operator_id", "SingleLineText"),
        col("code", "SingleLineText", rqd=True, unique=True),
        col("name", "SingleLineText"),
        col("type", "SingleLineText"),
        col("status", "SingleLineText", rqd=True),
        col("area", "SingleLineText"),
        col("address", "SingleLineText"),
        col("latitude", "Number"),
        col("longitude", "Number"),
        col("last_sync_at", "DateTime"),
        col("notes", "LongText"),
        col("created_at", "DateTime", rqd=True),
        col("updated_at", "DateTime", rqd=True),
    ],
    "preset_stock_templates": [
        col("operator_id", "SingleLineText"),
        col("name", "SingleLineText", rqd=True),
        col("source_type", "SingleLineText", rqd=True),
        col("source_id", "SingleLineText"),
        col("status", "SingleLineText"),
        col("created_by", "SingleLineText"),
        col("created_at", "DateTime", rqd=True),
        col("updated_at", "DateTime", rqd=True),
    ],
    "preset_stock_channels": [
        col("operator_id", "SingleLineText"),
        col("template_id", "SingleLineText", rqd=True),
        col("channel_no", "SingleLineText", rqd=True),
        col("product_id", "SingleLineText"),
        col("par_level", "Number", rqd=True),
        col("stock_level", "Number", rqd=True),
        col("created_at", "DateTime", rqd=True),
        col("updated_at", "DateTime", rqd=True),
    ],
}


def list_tables():
    res = http_get(f"/api/v1/db/meta/projects/{PROJECT_ID}/tables")
    return res.get("list", [])


def get_table_id(name):
    for t in list_tables():
        if t.get("table_name") == name:
            return t.get("id")
    return None


def get_table_info(table_id):
    return http_get(f"/api/v1/db/meta/tables/{table_id}")


def ensure_table(table_name, columns):
    if get_table_id(table_name):
        return "exists"
    payload = {"table_name": table_name, "title": table_name, "columns": columns}
    http_post(f"/api/v1/db/meta/projects/{PROJECT_ID}/tables", payload)
    return "created"


def ensure_id_pk(table_name):
    tid = get_table_id(table_name)
    if not tid:
        return "missing"
    info = get_table_info(tid)
    if any(c.get("column_name") == "id" for c in info.get("columns", [])):
        return "exists"
    payload = {"column_name": "id", "title": "id", "uidt": "ID"}
    http_post(f"/api/v1/db/meta/tables/{tid}/columns", payload)
    return "created"


def link_exists(child_id, link_title, parent_id=None):
    info = get_table_info(child_id)
    for c in info.get("columns", []):
        if c.get("title") == link_title:
            return True
        if c.get("uidt") == "LinkToAnotherRecord":
            col_opts = c.get("colOptions") or {}
            if parent_id and col_opts.get("fk_related_model_id") == parent_id:
                return True
    return False


def create_link(child_table, parent_table, link_title):
    child_id = get_table_id(child_table)
    parent_id = get_table_id(parent_table)
    if not child_id or not parent_id:
        return "missing"
    if link_exists(child_id, link_title, parent_id):
        return "exists"
    payload = {
        "column_name": link_title,
        "title": link_title,
        "uidt": "Links",
        "parentId": parent_id,
        "childId": child_id,
        "type": "bt",
    }
    http_post(f"/api/v1/db/meta/tables/{child_id}/columns", payload)
    return "created"


def main():
    results = {"tables": {}, "id_pk": {}, "links": {}}

    for table_name, cols in SCHEMA.items():
        results["tables"][table_name] = ensure_table(table_name, cols)

    for table_name in SCHEMA.keys():
        results["id_pk"][table_name] = ensure_id_pk(table_name)

    relations = [
        ("support_tickets", "operators", "operator_link"),
        ("products", "operators", "operator_link"),
        ("machines", "operators", "operator_link"),
        ("preset_stock_templates", "operators", "operator_link"),
        ("preset_stock_channels", "operators", "operator_link"),
        ("preset_stock_channels", "preset_stock_templates", "template_link"),
        ("preset_stock_channels", "products", "product_link"),
    ]
    for child, parent, title in relations:
        results["links"][f"{child}.{title}"] = create_link(child, parent, title)

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

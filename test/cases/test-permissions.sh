#!/usr/bin/env bash
# ================================================================
#  LIFF 權限驗證測試腳本
#  透過 MongoDB 直接操作角色，模擬前端權限邏輯驗證一致性
#
#  用法: bash test-permissions.sh          (在 honeypie 上執行)
#        ssh mozo@honeypie bash ~/zgovend/test/cases/test-permissions.sh
# ================================================================
set -euo pipefail

# --- 設定 ---
MONGO_CONTAINER="ebus-mongo"
MONGO_AUTH="-u admin -p ebus2026 --authenticationDatabase admin"
DB="ebus"
TEST_USER_ID="Utest_permission_check"
TEST_USER_NAME="Permission Test Bot"

# 營運商 & 機台 (pre-flight 自動偵測)
OP_A="" ; OP_A_NAME="" ; VM_OP_A=""
OP_B="" ; OP_B_NAME="" ; VM_OP_B=""

# 計數器
PASS=0 ; FAIL=0

# --- 顏色 ---
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ================================================================
#  Helper 函式
# ================================================================

# 執行 MongoDB 命令，回傳 JSON
mongo_eval() {
  docker exec "$MONGO_CONTAINER" mongosh $MONGO_AUTH --quiet \
    --eval "db = db.getSiblingDB('$DB'); $1" 2>/dev/null
}

# 設定測試用戶角色
set_roles() {
  local is_admin="$1"    # true/false
  local roles_json="$2"  # JSON array: [{operatorId:"x",roles:["r"]}]
  mongo_eval "
    db.users.updateOne(
      { lineUserId: '$TEST_USER_ID' },
      { \$set: { isAdmin: $is_admin, operatorRoles: $roles_json } }
    )" >/dev/null
}

# 查詢測試用戶角色 (回傳 JSON)
query_user() {
  mongo_eval "
    const u = db.users.findOne(
      { lineUserId: '$TEST_USER_ID' },
      { _id:0, lineUserId:1, isAdmin:1, operatorRoles:1 }
    );
    print(JSON.stringify(u || {}));"
}

# 查詢 VM 的 operatorId
query_vm_operator() {
  local vmid="$1"
  mongo_eval "
    const vm = db.vms.findOne({ vmid: '$vmid' }, { _id:0, operatorId:1 });
    print(vm ? vm.operatorId : '');"
}

# ── 前端邏輯模擬 ──

# 模擬 useLiff.ts 的計算邏輯 (輸入: mongo JSON, 輸出: 各flag)
compute_frontend() {
  local user_json="$1"
  local is_admin is_operator is_replenisher

  is_admin=$(echo "$user_json" | jq '.isAdmin // false')
  is_operator=$(echo "$user_json" | jq '[.operatorRoles // [] | .[]?.roles[]? | select(. == "operator")] | length > 0')
  is_replenisher=$(echo "$user_json" | jq '[.operatorRoles // [] | .[]?.roles[]? | select(. == "replenisher")] | length > 0')

  # Home.vue 區塊可見性
  local show_operator="false"
  [[ "$is_operator" == "true" || "$is_admin" == "true" ]] && show_operator="true"

  jq -nc \
    --argjson isAdmin "$is_admin" \
    --argjson isOperator "$is_operator" \
    --argjson isReplenisher "$is_replenisher" \
    --argjson showOperator "$show_operator" \
    --argjson showReplenisher "$is_replenisher" \
    --argjson showAdmin "$is_admin" \
    '{isAdmin: $isAdmin, isOperator: $isOperator, isReplenisher: $isReplenisher,
      showOperator: $showOperator, showReplenisher: $showReplenisher, showAdmin: $showAdmin}'
}

# 模擬 router guard: 巡補員能否存取某 vmid (回傳 ALLOWED/DENIED)
check_vm_access() {
  local vmid="$1"
  local user_json="$2"
  local vm_op
  vm_op=$(query_vm_operator "$vmid")
  [[ -z "$vm_op" ]] && { echo "DENIED_NO_VM"; return; }

  local has_role
  has_role=$(echo "$user_json" | jq --arg op "$vm_op" \
    '[.operatorRoles // [] | .[] | select(.operatorId == $op) | .roles[] | select(. == "replenisher")] | length > 0')
  [[ "$has_role" == "true" ]] && echo "ALLOWED" || echo "DENIED"
}

# 模擬 Picklist.vue VM 過濾 (回傳可見 vmid 逗號分隔)
check_picklist_vms() {
  local user_json="$1"
  local is_admin
  is_admin=$(echo "$user_json" | jq '.isAdmin // false')

  local all_vms
  all_vms=$(mongo_eval "print(JSON.stringify(db.vms.find({status:'active'},{_id:0,vmid:1,operatorId:1}).toArray()));")

  if [[ "$is_admin" == "true" ]]; then
    echo "$all_vms" | jq -r '[.[].vmid] | sort | join(",")'
  else
    local rep_ops
    rep_ops=$(echo "$user_json" | jq -r '[.operatorRoles // [] | .[] | select(.roles | index("replenisher")) | .operatorId] | join(",")')
    echo "$all_vms" | jq -r --arg ops "$rep_ops" \
      '($ops | split(",")) as $op_list |
       [.[] | select(.operatorId as $oid | $op_list | index($oid)) | .vmid] | sort | join(",")'
  fi
}

# operatorIdsWithRole
get_ids_with_role() {
  local user_json="$1" role="$2"
  echo "$user_json" | jq -r --arg r "$role" \
    '[.operatorRoles // [] | .[] | select(.roles | index($r)) | .operatorId] | sort | join(",")'
}

# ── 斷言 ──

assert_eq() {
  local desc="$1" got="$2" expected="$3"
  if [[ "$got" == "$expected" ]]; then
    echo -e "  ${GREEN}PASS${NC} $desc"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $desc (期望: ${BOLD}$expected${NC}, 實際: ${BOLD}$got${NC})"
    FAIL=$((FAIL + 1))
  fi
}

header() {
  echo ""
  echo -e "${CYAN}=== $1 ===${NC}"
}

# ================================================================
#  Pre-flight
# ================================================================

echo -e "${BOLD}================================================================${NC}"
echo -e "${BOLD}  LIFF 權限驗證測試${NC}"
echo -e "  MongoDB: ${CYAN}$MONGO_CONTAINER${NC} / ${CYAN}$DB${NC}"
echo -e "  測試用戶: ${CYAN}$TEST_USER_ID${NC}"
echo -e "${BOLD}================================================================${NC}"
echo ""
echo -e "${YELLOW}--- Pre-flight ---${NC}"

# 1. MongoDB 連線
mongo_check=$(mongo_eval "print('OK')" 2>&1)
if [[ "$mongo_check" == *"OK"* ]]; then
  echo -e "  ${GREEN}✓${NC} MongoDB 連線正常"
else
  echo -e "  ${RED}✗${NC} MongoDB 連線失敗"
  exit 1
fi

# 2. 建立/重設測試用戶
mongo_eval "
  db.users.updateOne(
    { lineUserId: '$TEST_USER_ID' },
    { \$set: { lineUserId: '$TEST_USER_ID', displayName: '$TEST_USER_NAME', pictureUrl: '', isAdmin: false, operatorRoles: [] },
      \$setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  )" >/dev/null
echo -e "  ${GREEN}✓${NC} 測試用戶已建立: $TEST_USER_NAME"

# 3. 偵測營運商 & 機台
ops_json=$(mongo_eval "print(JSON.stringify(db.operators.find({},{_id:0,code:1,name:1}).toArray()));")
vms_json=$(mongo_eval "print(JSON.stringify(db.vms.find({status:'active'},{_id:0,vmid:1,operatorId:1}).toArray()));")

op_count=$(echo "$ops_json" | jq 'length')
if (( op_count < 2 )); then
  echo -e "  ${RED}✗${NC} 需要至少 2 個營運商，目前只有 $op_count"
  exit 1
fi

# 選取有 active VM 的兩個不同營運商
OP_A=$(echo "$vms_json" | jq -r '[.[].operatorId] | unique[0]')
VM_OP_A=$(echo "$vms_json" | jq -r --arg op "$OP_A" '[.[] | select(.operatorId == $op) | .vmid][0]')
OP_A_NAME=$(echo "$ops_json" | jq -r --arg op "$OP_A" '[.[] | select(.code == $op) | .name][0]')

OP_B=$(echo "$vms_json" | jq -r --arg opa "$OP_A" '[.[] | select(.operatorId != $opa) | .operatorId] | unique[0]')
VM_OP_B=$(echo "$vms_json" | jq -r --arg op "$OP_B" '[.[] | select(.operatorId == $op) | .vmid][0]')
OP_B_NAME=$(echo "$ops_json" | jq -r --arg op "$OP_B" '[.[] | select(.code == $op) | .name][0]')

echo -e "  ${GREEN}✓${NC} 營運商 A: ${BOLD}$OP_A${NC} ($OP_A_NAME) → VM: $VM_OP_A"
echo -e "  ${GREEN}✓${NC} 營運商 B: ${BOLD}$OP_B${NC} ($OP_B_NAME) → VM: $VM_OP_B"

# ================================================================
#  測試情境
# ================================================================

# --- 情境 1: 無任何角色 ---
header "情境 1: 無任何角色 (裸用戶)"
echo -e "  ${DIM}設定: isAdmin=false, operatorRoles=[]${NC}"
set_roles false '[]'
user_json=$(query_user)
fe=$(compute_frontend "$user_json")

assert_eq "isAdmin = false"       "$(echo "$fe" | jq -r '.isAdmin')"       "false"
assert_eq "isOperator = false"    "$(echo "$fe" | jq -r '.isOperator')"    "false"
assert_eq "isReplenisher = false" "$(echo "$fe" | jq -r '.isReplenisher')" "false"
assert_eq "營運管理區塊: 隱藏"    "$(echo "$fe" | jq -r '.showOperator')"  "false"
assert_eq "巡補員區塊: 隱藏"      "$(echo "$fe" | jq -r '.showReplenisher')" "false"
assert_eq "系統管理區塊: 隱藏"    "$(echo "$fe" | jq -r '.showAdmin')"     "false"

# --- 情境 2: 僅系統管理 ---
header "情境 2: 僅系統管理員"
echo -e "  ${DIM}設定: isAdmin=true, operatorRoles=[]${NC}"
set_roles true '[]'
user_json=$(query_user)
fe=$(compute_frontend "$user_json")

assert_eq "isAdmin = true"        "$(echo "$fe" | jq -r '.isAdmin')"       "true"
assert_eq "isOperator = false"    "$(echo "$fe" | jq -r '.isOperator')"    "false"
assert_eq "isReplenisher = false" "$(echo "$fe" | jq -r '.isReplenisher')" "false"
assert_eq "營運管理區塊: 顯示 (v-if isAdmin)" "$(echo "$fe" | jq -r '.showOperator')" "true"
assert_eq "巡補員區塊: 隱藏"      "$(echo "$fe" | jq -r '.showReplenisher')" "false"
assert_eq "系統管理區塊: 顯示"    "$(echo "$fe" | jq -r '.showAdmin')"     "true"
op_ids=$(get_ids_with_role "$user_json" "operator")
assert_eq "operatorIdsWithRole(operator) = 空" "$op_ids" ""

# --- 情境 3: 單一營運商管理員 ---
header "情境 3: 單一營運商管理員 ($OP_A)"
echo -e "  ${DIM}設定: isAdmin=false, operatorRoles=[{$OP_A, [operator]}]${NC}"
set_roles false "[{operatorId:'$OP_A', roles:['operator']}]"
user_json=$(query_user)
fe=$(compute_frontend "$user_json")

assert_eq "isAdmin = false"       "$(echo "$fe" | jq -r '.isAdmin')"       "false"
assert_eq "isOperator = true"     "$(echo "$fe" | jq -r '.isOperator')"    "true"
assert_eq "isReplenisher = false" "$(echo "$fe" | jq -r '.isReplenisher')" "false"
assert_eq "營運管理區塊: 顯示"    "$(echo "$fe" | jq -r '.showOperator')"  "true"
assert_eq "巡補員區塊: 隱藏"      "$(echo "$fe" | jq -r '.showReplenisher')" "false"
assert_eq "系統管理區塊: 隱藏"    "$(echo "$fe" | jq -r '.showAdmin')"     "false"
op_ids=$(get_ids_with_role "$user_json" "operator")
assert_eq "operatorIdsWithRole(operator) = $OP_A" "$op_ids" "$OP_A"

# --- 情境 4: 單一營運商巡補員 ---
header "情境 4: 單一營運商巡補員 ($OP_A)"
echo -e "  ${DIM}設定: isAdmin=false, operatorRoles=[{$OP_A, [replenisher]}]${NC}"
set_roles false "[{operatorId:'$OP_A', roles:['replenisher']}]"
user_json=$(query_user)
fe=$(compute_frontend "$user_json")

assert_eq "isAdmin = false"       "$(echo "$fe" | jq -r '.isAdmin')"       "false"
assert_eq "isOperator = false"    "$(echo "$fe" | jq -r '.isOperator')"    "false"
assert_eq "isReplenisher = true"  "$(echo "$fe" | jq -r '.isReplenisher')" "true"
assert_eq "營運管理區塊: 隱藏"    "$(echo "$fe" | jq -r '.showOperator')"  "false"
assert_eq "巡補員區塊: 顯示"      "$(echo "$fe" | jq -r '.showReplenisher')" "true"
assert_eq "系統管理區塊: 隱藏"    "$(echo "$fe" | jq -r '.showAdmin')"     "false"
access=$(check_vm_access "$VM_OP_A" "$user_json")
assert_eq "可巡補 $VM_OP_A ($OP_A 的機台)" "$access" "ALLOWED"
access=$(check_vm_access "$VM_OP_B" "$user_json")
assert_eq "不可巡補 $VM_OP_B ($OP_B 的機台)" "$access" "DENIED"

# --- 情境 5: 跨營運商拒絕 ---
header "情境 5: 跨營運商拒絕 (巡補 $OP_A，存取 $OP_B 機台)"
echo -e "  ${DIM}沿用情境 4 角色${NC}"
# router guard
access=$(check_vm_access "$VM_OP_B" "$user_json")
assert_eq "Router guard 拒絕 $VM_OP_B" "$access" "DENIED"
# picklist 過濾
picklist=$(check_picklist_vms "$user_json")
echo "$picklist" | grep -q "$VM_OP_A" && pl_a="true" || pl_a="false"
echo "$picklist" | grep -q "$VM_OP_B" && pl_b="true" || pl_b="false"
assert_eq "Picklist 包含 $VM_OP_A ($OP_A)" "$pl_a" "true"
assert_eq "Picklist 不含 $VM_OP_B ($OP_B)" "$pl_b" "false"

# --- 情境 6: 同營運商 operator + replenisher ---
header "情境 6: 同營運商 operator + replenisher ($OP_A)"
echo -e "  ${DIM}設定: isAdmin=false, operatorRoles=[{$OP_A, [operator,replenisher]}]${NC}"
set_roles false "[{operatorId:'$OP_A', roles:['operator','replenisher']}]"
user_json=$(query_user)
fe=$(compute_frontend "$user_json")

assert_eq "isOperator = true"     "$(echo "$fe" | jq -r '.isOperator')"    "true"
assert_eq "isReplenisher = true"  "$(echo "$fe" | jq -r '.isReplenisher')" "true"
assert_eq "營運管理區塊: 顯示"    "$(echo "$fe" | jq -r '.showOperator')"  "true"
assert_eq "巡補員區塊: 顯示"      "$(echo "$fe" | jq -r '.showReplenisher')" "true"
assert_eq "系統管理區塊: 隱藏"    "$(echo "$fe" | jq -r '.showAdmin')"     "false"
op_ids=$(get_ids_with_role "$user_json" "operator")
assert_eq "operatorIdsWithRole(operator) = $OP_A" "$op_ids" "$OP_A"
access=$(check_vm_access "$VM_OP_A" "$user_json")
assert_eq "可巡補 $VM_OP_A" "$access" "ALLOWED"
access=$(check_vm_access "$VM_OP_B" "$user_json")
assert_eq "不可巡補 $VM_OP_B (跨營運商)" "$access" "DENIED"

# --- 情境 7: 多營運商不同角色 ---
header "情境 7: 多營運商不同角色 ($OP_A=operator, $OP_B=replenisher)"
echo -e "  ${DIM}設定: isAdmin=false, operatorRoles=[{$OP_A,[operator]},{$OP_B,[replenisher]}]${NC}"
set_roles false "[{operatorId:'$OP_A', roles:['operator']}, {operatorId:'$OP_B', roles:['replenisher']}]"
user_json=$(query_user)
fe=$(compute_frontend "$user_json")

assert_eq "isOperator = true"     "$(echo "$fe" | jq -r '.isOperator')"    "true"
assert_eq "isReplenisher = true"  "$(echo "$fe" | jq -r '.isReplenisher')" "true"
assert_eq "營運管理區塊: 顯示"    "$(echo "$fe" | jq -r '.showOperator')"  "true"
assert_eq "巡補員區塊: 顯示"      "$(echo "$fe" | jq -r '.showReplenisher')" "true"
assert_eq "系統管理區塊: 隱藏"    "$(echo "$fe" | jq -r '.showAdmin')"     "false"
op_ids=$(get_ids_with_role "$user_json" "operator")
assert_eq "operator 列表 = $OP_A" "$op_ids" "$OP_A"
rep_ids=$(get_ids_with_role "$user_json" "replenisher")
assert_eq "replenisher 列表 = $OP_B" "$rep_ids" "$OP_B"
access=$(check_vm_access "$VM_OP_A" "$user_json")
assert_eq "不可巡補 $VM_OP_A ($OP_A 僅 operator)" "$access" "DENIED"
access=$(check_vm_access "$VM_OP_B" "$user_json")
assert_eq "可巡補 $VM_OP_B ($OP_B 有 replenisher)" "$access" "ALLOWED"

# --- 情境 8: 系統管理 + 巡補員 ---
header "情境 8: 系統管理 + 巡補員 ($OP_A)"
echo -e "  ${DIM}設定: isAdmin=true, operatorRoles=[{$OP_A,[replenisher]}]${NC}"
set_roles true "[{operatorId:'$OP_A', roles:['replenisher']}]"
user_json=$(query_user)
fe=$(compute_frontend "$user_json")

assert_eq "isAdmin = true"        "$(echo "$fe" | jq -r '.isAdmin')"       "true"
assert_eq "isReplenisher = true"  "$(echo "$fe" | jq -r '.isReplenisher')" "true"
assert_eq "營運管理區塊: 顯示 (isAdmin)"  "$(echo "$fe" | jq -r '.showOperator')"  "true"
assert_eq "巡補員區塊: 顯示"      "$(echo "$fe" | jq -r '.showReplenisher')" "true"
assert_eq "系統管理區塊: 顯示"    "$(echo "$fe" | jq -r '.showAdmin')"     "true"

# Picklist: admin 看全部機台
picklist=$(check_picklist_vms "$user_json")
echo "$picklist" | grep -q "$VM_OP_A" && pl_a="true" || pl_a="false"
echo "$picklist" | grep -q "$VM_OP_B" && pl_b="true" || pl_b="false"
assert_eq "Picklist (admin): 包含 $VM_OP_A" "$pl_a" "true"
assert_eq "Picklist (admin): 包含 $VM_OP_B (admin 看全部)" "$pl_b" "true"

# Router guard: 嚴格檢查 replenisher 角色
access=$(check_vm_access "$VM_OP_A" "$user_json")
assert_eq "Router guard 允許 $VM_OP_A (有 replenisher)" "$access" "ALLOWED"
access=$(check_vm_access "$VM_OP_B" "$user_json")
assert_eq "Router guard 拒絕 $VM_OP_B (admin 不繞過 guard)" "$access" "DENIED"

# --- 情境 9: 完整權限 ---
header "情境 9: 完整權限 (admin + $OP_A=全角色, $OP_B=operator)"
echo -e "  ${DIM}設定: isAdmin=true, operatorRoles=[{$OP_A,[operator,replenisher]},{$OP_B,[operator]}]${NC}"
set_roles true "[{operatorId:'$OP_A', roles:['operator','replenisher']}, {operatorId:'$OP_B', roles:['operator']}]"
user_json=$(query_user)
fe=$(compute_frontend "$user_json")

assert_eq "isAdmin = true"        "$(echo "$fe" | jq -r '.isAdmin')"       "true"
assert_eq "isOperator = true"     "$(echo "$fe" | jq -r '.isOperator')"    "true"
assert_eq "isReplenisher = true"  "$(echo "$fe" | jq -r '.isReplenisher')" "true"
assert_eq "全部區塊可見"          "$(echo "$fe" | jq -r '[.showOperator, .showReplenisher, .showAdmin] | all')" "true"

expected_ops=$(echo -e "$OP_A\n$OP_B" | sort | paste -sd,)
op_ids=$(get_ids_with_role "$user_json" "operator")
assert_eq "operator 列表 = $expected_ops" "$op_ids" "$expected_ops"
rep_ids=$(get_ids_with_role "$user_json" "replenisher")
assert_eq "replenisher 列表 = $OP_A" "$rep_ids" "$OP_A"

access=$(check_vm_access "$VM_OP_A" "$user_json")
assert_eq "可巡補 $VM_OP_A (有 replenisher)" "$access" "ALLOWED"
access=$(check_vm_access "$VM_OP_B" "$user_json")
assert_eq "不可巡補 $VM_OP_B (僅 operator 無 replenisher)" "$access" "DENIED"

# --- 情境 10: 多營運商巡補員 ---
header "情境 10: 多營運商巡補員 ($OP_A + $OP_B)"
echo -e "  ${DIM}設定: isAdmin=false, operatorRoles=[{$OP_A,[replenisher]},{$OP_B,[replenisher]}]${NC}"
set_roles false "[{operatorId:'$OP_A', roles:['replenisher']}, {operatorId:'$OP_B', roles:['replenisher']}]"
user_json=$(query_user)
fe=$(compute_frontend "$user_json")

assert_eq "isAdmin = false"       "$(echo "$fe" | jq -r '.isAdmin')"       "false"
assert_eq "isOperator = false"    "$(echo "$fe" | jq -r '.isOperator')"    "false"
assert_eq "isReplenisher = true"  "$(echo "$fe" | jq -r '.isReplenisher')" "true"
assert_eq "營運管理區塊: 隱藏"    "$(echo "$fe" | jq -r '.showOperator')"  "false"
assert_eq "巡補員區塊: 顯示"      "$(echo "$fe" | jq -r '.showReplenisher')" "true"
assert_eq "系統管理區塊: 隱藏"    "$(echo "$fe" | jq -r '.showAdmin')"     "false"

access=$(check_vm_access "$VM_OP_A" "$user_json")
assert_eq "可巡補 $VM_OP_A" "$access" "ALLOWED"
access=$(check_vm_access "$VM_OP_B" "$user_json")
assert_eq "可巡補 $VM_OP_B" "$access" "ALLOWED"

expected_reps=$(echo -e "$OP_A\n$OP_B" | sort | paste -sd,)
rep_ids=$(get_ids_with_role "$user_json" "replenisher")
assert_eq "replenisher 列表 = $expected_reps" "$rep_ids" "$expected_reps"

# ================================================================
#  Cleanup
# ================================================================

echo ""
echo -e "${YELLOW}--- Cleanup ---${NC}"
set_roles false '[]'
echo -e "  ${GREEN}✓${NC} 測試用戶角色已清除"

# ================================================================
#  Summary
# ================================================================

TOTAL=$((PASS + FAIL))
echo ""
echo -e "${BOLD}================================================================${NC}"
if (( FAIL == 0 )); then
  echo -e "  結果: ${GREEN}${PASS} PASS${NC}, ${FAIL} FAIL (共 ${TOTAL} 項)"
  echo -e "  ${GREEN}${BOLD}全部測試通過！${NC}"
else
  echo -e "  結果: ${GREEN}${PASS} PASS${NC}, ${RED}${FAIL} FAIL${NC} (共 ${TOTAL} 項)"
  echo -e "  ${RED}${BOLD}有 ${FAIL} 項測試失敗${NC}"
fi
echo -e "${BOLD}================================================================${NC}"

exit $FAIL

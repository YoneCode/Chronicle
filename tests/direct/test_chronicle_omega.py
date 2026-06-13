import json

CONTRACT = "contracts/chronicle_omega.py"
CTX_URL = "https://api.example.com/context"


def _deploy(direct_deploy):
    # ctor: (context_url, tolerance_bps)
    # Pin a GenVM release that ships the genvm-universal artifact tarball.
    return direct_deploy(CONTRACT, CTX_URL, 1500, sdk_version="v0.2.12")


def test_register_and_get_covenant(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    c.register_covenant("cov1", "Maximize ecosystem resilience during systemic stress.")

    cov = c.get_covenant("cov1")
    assert cov["covenant_id"] == "cov1"
    assert cov["status"] == "active"
    assert cov["epoch"] == 0
    assert cov["capital_committed"] == 0
    assert cov["trust_gradient_bps"] == 5000


def test_register_rejects_duplicate(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    c.register_covenant("cov1", "Some mandate")
    with direct_vm.expect_revert("covenant already exists"):
        c.register_covenant("cov1", "Other mandate")


def test_register_rejects_empty_mandate(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("invalid mandate length"):
        c.register_covenant("cov2", "")


def test_fund_covenant_accumulates(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    c.register_covenant("cov1", "mandate")

    direct_vm.value = 5 * 10**18
    c.fund_covenant("cov1")
    direct_vm.value = 3 * 10**18
    c.fund_covenant("cov1")

    cov = c.get_covenant("cov1")
    assert cov["capital_committed"] == 8 * 10**18


def test_fund_zero_reverts(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    c.register_covenant("cov1", "mandate")
    direct_vm.value = 0
    with direct_vm.expect_revert("zero deposit"):
        c.fund_covenant("cov1")


def test_set_operator_only_admin(direct_vm, direct_deploy, direct_owner, direct_bob):
    c = _deploy(direct_deploy)  # admin == default_sender == direct_owner
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only admin"):
        c.set_operator(direct_bob)


def test_status_transition(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    c.register_covenant("cov1", "mandate")
    c.set_status("cov1", "paused")
    assert c.get_covenant("cov1")["status"] == "paused"


def test_unknown_covenant_reverts(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("unknown covenant"):
        c.get_covenant("missing")


def test_evaluate_epoch_releases_capital(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy)  # owner is admin & operator
    direct_vm.sender = direct_owner
    c.register_covenant("cov1", "Release capital toward resilience.")
    direct_vm.value = 100 * 10**18
    c.fund_covenant("cov1")

    direct_vm.mock_web(r".*api\.example\.com/context.*",
                       {"status": 200, "body": "systemic stress easing"})
    direct_vm.mock_llm(r".*allocation_bps.*",
                       json.dumps({"allocation_bps": 2500, "summary": "partial release"}))

    res = c.evaluate_epoch("cov1")
    assert res["allocation_bps"] == 2500
    # 25% of 100e18 = 25e18
    assert res["capital_released"] == 25 * 10**18

    cov = c.get_covenant("cov1")
    assert cov["epoch"] == 1
    assert cov["capital_released"] == 25 * 10**18

    cps = c.get_checkpoints("cov1")
    assert len(cps) == 1
    assert cps[0]["allocation_bps"] == 2500


def test_evaluate_epoch_requires_operator(direct_vm, direct_deploy, direct_owner, direct_bob):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_owner
    c.register_covenant("cov1", "mandate")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not authorized"):
        c.evaluate_epoch("cov1")

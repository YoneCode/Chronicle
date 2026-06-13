"""
Integration smoke test — runs against a real GenLayer environment.

Requires a funded account. Run with:
    set -a && . ./.env && set +a
    gltest tests/integration/ -v -s --network testnet_bradbury

This deploys ChronicleOmega, registers a covenant, and reads it back through
full consensus. It does NOT exercise evaluate_epoch (which spends real LLM
budget); add that separately when you want to validate the nondet path.
"""
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded


def test_deploy_register_and_read():
    factory = get_contract_factory("ChronicleOmega")
    contract = factory.deploy(args=["https://api.example.com/context", 1500])

    receipt = contract.register_covenant(
        args=["smoke-1", "Maximize ecosystem resilience during systemic stress."]
    ).transact()
    assert tx_execution_succeeded(receipt)

    covenant = contract.get_covenant(args=["smoke-1"]).call()
    assert covenant["covenant_id"] == "smoke-1"
    assert covenant["status"] == "active"
    assert covenant["epoch"] == 0

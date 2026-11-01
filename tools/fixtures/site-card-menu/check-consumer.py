import pathlib, sys

# Usage: python3 -I check-consumer.py <captured stdout file>. Compares every byte through EOF.
expected = pathlib.Path(__file__).with_name("expected.jsonl").read_bytes()
actual = pathlib.Path(sys.argv[1]).read_bytes()
if actual != expected:
    print("consumer mismatch", len(actual), len(expected))
    sys.exit(1)
print("consumer exact", len(expected))

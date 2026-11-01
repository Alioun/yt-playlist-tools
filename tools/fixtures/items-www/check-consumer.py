import pathlib
import sys

expected = pathlib.Path(__file__).with_name('expected.jsonl').read_bytes()
assert expected.endswith(b'\n') and len(expected.splitlines()) == 15
assert len(sys.argv) == 3, 'Pass both independently captured consumer outputs'
for filename in sys.argv[1:]:
    actual = pathlib.Path(filename).read_bytes()
    assert actual == expected, 'Complete consumer bytes differ through EOF: ' + filename
print('Both complete consumer outputs match the independent 15-record expectation through EOF')

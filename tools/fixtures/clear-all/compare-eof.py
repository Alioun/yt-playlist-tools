import json, pathlib, sys

expected = pathlib.Path(sys.argv[1]).read_bytes()
assert expected.endswith(b'\n')
for line in expected.splitlines():
    json.loads(line)
for name in sys.argv[2:]:
    actual = pathlib.Path(name).read_bytes()
    assert actual == expected, 'Complete consumer stream differs: ' + name
assert len(sys.argv) == 4, 'Two independent consumer streams are required'
print('Both complete consumer streams equal the independent golden through EOF')

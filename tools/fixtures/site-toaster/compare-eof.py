from pathlib import Path
import hashlib,json,sys

expected=Path('tools/fixtures/site-toaster/expected.jsonl').read_bytes()
one=Path(sys.argv[1]).read_bytes();two=Path(sys.argv[2]).read_bytes()
assert one==expected and two==expected and one==two, 'consumer outputs differ through EOF'
print(json.dumps({'bytes':len(expected),'sha256':hashlib.sha256(expected).hexdigest(),'equalThroughEOF':True}))

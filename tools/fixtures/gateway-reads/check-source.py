"""Static read-unit checks. This script imports no product code."""
import json
import pathlib
import re

root = pathlib.Path(__file__).resolve().parents[3]
production = ["read-port.ts", "read-parsers.ts", "read-gateway.ts", "live-reads.ts"]
for name in production:
    text = (root / "src/page" / name).read_text()
    for pattern in [r"\bconsole\s*(?:\.|\[)", r"\b(?:setInterval|setTimeout|requestAnimationFrame)\s*\(",
                    r"\b(?:MutationObserver|ResizeObserver|IntersectionObserver)\b", r"\b(?:fetch|XMLHttpRequest)\s*\(",
                    r"\b(?:localStorage|sessionStorage|indexedDB)\b", r"\b(?:chrome|browser)\s*\."]:
        assert not re.search(pattern, text), (name, pattern)
    assert "document.cookie" not in text, name
gateway = (root / "src/page/read-gateway.ts").read_text()
assert "isPageJobResultFor(job, result)" in gateway
assert "isStreamData(stream, data)" in gateway
assert "makeShapeOutline" in gateway and "readVocabulary.schemaKeys" in gateway
assert "supportsJob(site, job.kind)" in gateway and "supportsStream(site, stream)" in gateway
assert "crypto" not in gateway and "hash" not in gateway
for name in ["read-parsers.ts", "read-gateway.ts", "live-reads.ts"]:
    assert not re.search(r'["\']read\.(?:config|player|music|navigation|target|location)', (root / "src/page" / name).read_text()), name
print(json.dumps({"check": "gateway-read-static-source", "status": "pass", "files": len(production), "limits": "text checks only; no compiler or behavior evidence"}, separators=(",", ":")))

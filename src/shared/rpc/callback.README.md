# Shared callback transport

`callbackTransport<Sender>(port)` adapts an injected one-shot callback port to `Transport<Sender>`. It has no native browser import or ambient API access. The background runtime wrapper and the site ExtLink adapter both use it.

The body comes from the frozen background `runtimeTransport`. An unclaimed or throwing receive returns literal `false`. A claimed receive returns literal `true` synchronously and answers once through `sendResponse`. A rejected claim answers `undefined`. Response errors stay contained. Disposal removes the listener once and releases open claims as `undefined`, including disposal during receive or response. A later completion cannot send another answer.

The original background behavior and type tests remain unchanged. The adjacent shared tests add direct structural-port cases. Neither suite ran during this authoring task. Native browser behavior remains unproven.

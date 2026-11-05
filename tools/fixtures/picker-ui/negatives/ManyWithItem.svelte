<script lang="ts">
  import { PickerModel } from "../../../../src/shared/picker/model.svelte"
  import { itemSource } from "../../picker-model/fake-source"
  const invalid = new PickerModel({ mode: "many", site: "www", source: itemSource().source })
</script>
<span>{invalid.mode}</span>

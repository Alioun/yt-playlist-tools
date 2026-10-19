// THROWAWAY PROTOTYPE (ticket 14): a one-line feature entrypoint, as in ticket 17 §7.
import { definePageFeature } from "../site/feature";
import { quickSave } from "../site/features/quick-save/feature";
definePageFeature(quickSave);

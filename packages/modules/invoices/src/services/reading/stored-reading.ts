// The reading schemas live in the contract, which the browser also reads; the reading code imports them here.
export {
  type QuotedValue,
  quotedValue,
  READING_FIELDS,
  type ReadingField,
  type StoredReading,
  storedReading,
} from "../../contract.ts";

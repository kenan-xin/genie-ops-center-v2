"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@genie/ui";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { type ReactNode, useRef, useState } from "react";

import type { ScopeRecord } from "../../services/roles/records.ts";

/**
 * One record of one record type, picked by a server search (R-37c, AD2). The server lists only
 * the records the caller can open (AD3). An answer counts only while its query is the newest one,
 * so a slow answer to an older query never replaces the list (the race `3a85d3a6` fixed).
 */
export function RecordPicker(props: {
  readonly recordType: string;
  readonly value: ScopeRecord | null;
  readonly onSearch: (
    recordType: string,
    query: string
  ) => Promise<readonly ScopeRecord[]>;
  readonly onPick: (record: ScopeRecord) => void;
}): ReactNode {
  const [records, setRecords] = useState<readonly ScopeRecord[]>([]);

  const newest = useRef<string | null>(null);

  const run = (query: string) => {
    newest.current = query;
    void props.onSearch(props.recordType, query).then(
      (answer) => {
        if (newest.current === query) setRecords(answer);
      },
      () => {
        if (newest.current === query) setRecords([]);
      }
    );
  };

  const search = useDebouncedCallback(run, { wait: 300 });

  return (
    <Combobox<ScopeRecord>
      items={records}
      value={props.value}
      filter={null}
      itemToStringLabel={(record) => record.label}
      isItemEqualToValue={(item, value) => item.id === value.id}
      onOpenChange={(open) => {
        if (open) run("");
      }}
      onInputValueChange={(text, details) => {
        // Picking an item writes its label into the field: that is no search.
        if (details.reason !== "item-press") search(text.trim());
      }}
      onValueChange={(record: ScopeRecord | null) => {
        if (record !== null) props.onPick(record);
      }}
    >
      {/* A combobox takes no name from its text, so the prompt names it and the text shows the pick. */}
      <ComboboxTrigger aria-label="Choose a record">
        {props.value?.label ?? "Choose a record"}
      </ComboboxTrigger>
      <ComboboxContent aria-label="Choose a record">
        <div className="border-b border-border p-2">
          <ComboboxInput aria-label="Search records" placeholder="Search" />
        </div>
        <ComboboxEmpty>No record found that you can open.</ComboboxEmpty>
        <ComboboxList>
          {(record: ScopeRecord) => (
            <ComboboxItem key={record.id} value={record}>
              {record.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

"use client";

import {
  buildQuerySuggestions,
  isCommittableInput,
  parseQueryInput,
  resolveActiveQueryTokens,
  toQueryTokenString,
  type QueryFieldDefinition,
  type QueryInputMode,
  type QuerySuggestion,
  type QueryToken,
} from "./queryableAutocomplete";
import { type SyntheticEvent, useCallback, useMemo, useRef, useState, useEffect } from "react";
import type {
  AutocompleteChangeDetails,
  AutocompleteChangeReason,
  AutocompleteInputChangeReason,
} from "@mui/material/useAutocomplete";

export interface UseQueryableAutocompleteOptions {
  /** The queryable fields (e.g. `type`) and their allowed values. */
  readonly fields: readonly QueryFieldDefinition[];
  /** Maximum number of dropdown suggestions to show. */
  readonly limit?: number;
  /** Initial committed chips. */
  readonly defaultValue?: readonly string[];
  /**
   * Called whenever the effective filter changes — the committed chips plus the
   * current plain-text input (so name search is live). This is what a consumer
   * uses to filter its own data.
   */
  readonly onTokensChange?: (tokens: QueryToken[]) => void;
}

export interface QueryableAutocompleteBinding {
  readonly multiple: true;
  readonly freeSolo: true;
  readonly clearOnBlur: false;
  readonly selectOnFocus: false;
  readonly handleHomeEndKeys: true;
  readonly autoHighlight: true;
  readonly options: string[];
  readonly value: string[];
  readonly inputValue: string;
  readonly filterOptions: (candidateOptions: string[]) => string[];
  readonly onInputChange: (
    event: SyntheticEvent,
    nextInputValue: string,
    reason: AutocompleteInputChangeReason,
  ) => void;
  readonly onChange: (
    event: SyntheticEvent,
    nextValue: string[],
    reason: AutocompleteChangeReason,
    details?: AutocompleteChangeDetails<string>,
  ) => void;
}

export interface UseQueryableAutocompleteResult {
  /** The committed chip strings. */
  readonly value: readonly string[];
  /** The current, uncommitted input text. */
  readonly inputValue: string;
  /** The current input mode (text / field-key / field-value). */
  readonly mode: QueryInputMode;
  /** Dropdown suggestions for the current input, keyed by their insert value. */
  readonly suggestions: readonly QuerySuggestion[];
  /** Look up the suggestion metadata for an option string (for rendering). */
  readonly getSuggestion: (insertValue: string) => QuerySuggestion | undefined;
  /** Remove a committed chip by its string. */
  readonly removeToken: (token: string) => void;
  /** Props to spread onto the MUI `<Autocomplete>`. */
  readonly getAutocompleteProps: () => QueryableAutocompleteBinding;
}

export function useQueryableAutocomplete({
  fields,
  limit = 20,
  defaultValue = [],
  onTokensChange,
}: UseQueryableAutocompleteOptions): UseQueryableAutocompleteResult {
  const [value, setValue] = useState<string[]>(() => [...defaultValue]);
  const [inputValue, setInputValue] = useState("");

  const mode = useMemo(() => parseQueryInput(inputValue, fields), [inputValue, fields]);

  const suggestions = useMemo(
    () => buildQuerySuggestions(inputValue, fields, limit),
    [inputValue, fields, limit],
  );

  const suggestionByValue = useMemo(() => {
    const map = new Map<string, QuerySuggestion>();
    for (const suggestion of suggestions) {
      map.set(suggestion.insertValue, suggestion);
    }
    return map;
  }, [suggestions]);

  const options = useMemo(
    () => suggestions.map((suggestion) => suggestion.insertValue),
    [suggestions],
  );

  const onTokensChangeRef = useRef(onTokensChange);
  useEffect(() => {
    onTokensChangeRef.current = onTokensChange;
  }, [onTokensChange]);

  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const inputValueRef = useRef(inputValue);
  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  const updateState = useCallback(
    (nextValue: string[], nextInputValue: string) => {
      setValue(nextValue);
      setInputValue(nextInputValue);
      onTokensChangeRef.current?.(resolveActiveQueryTokens(nextValue, nextInputValue, fields));
    },
    [fields],
  );

  const addToken = useCallback(
    (token: string) => {
      const current = valueRef.current;
      const nextValue = current.includes(token) ? current : [...current, token];
      setValue(nextValue);
      setInputValue("");
      onTokensChangeRef.current?.(resolveActiveQueryTokens(nextValue, "", fields));
    },
    [fields],
  );

  const removeToken = useCallback(
    (token: string) => {
      const current = valueRef.current;
      const nextValue = current.filter((entry) => entry !== token);
      setValue(nextValue);
      onTokensChangeRef.current?.(
        resolveActiveQueryTokens(nextValue, inputValueRef.current, fields),
      );
    },
    [fields],
  );

  const handleInputChange = useCallback(
    (_: SyntheticEvent, nextInputValue: string, reason: AutocompleteInputChangeReason) => {
      if (reason === "input" || reason === "clear") {
        setInputValue(nextInputValue);
        onTokensChangeRef.current?.(
          resolveActiveQueryTokens(valueRef.current, nextInputValue, fields),
        );
      }
    },
    [fields],
  );

  const handleChange = useCallback(
    (
      _: SyntheticEvent,
      nextValue: string[],
      reason: AutocompleteChangeReason,
      details?: AutocompleteChangeDetails<string>,
    ) => {
      if (reason === "removeOption" || reason === "clear") {
        updateState(nextValue, inputValueRef.current);
        return;
      }

      const option = details?.option;
      if (typeof option !== "string") {
        return;
      }

      if (reason === "selectOption") {
        if (isCommittableInput(option, fields)) {
          addToken(option);
        } else {
          updateState(valueRef.current, option);
        }
        return;
      }

      if (reason === "createOption") {
        const token = toQueryTokenString(option, fields);
        if (token) {
          addToken(token);
        } else {
          updateState(valueRef.current, option);
        }
      }
    },
    [addToken, fields, updateState],
  );

  const getAutocompleteProps = useCallback(
    (): QueryableAutocompleteBinding => ({
      multiple: true,
      freeSolo: true,
      clearOnBlur: false,
      selectOnFocus: false,
      handleHomeEndKeys: true,
      autoHighlight: true,
      options,
      value,
      inputValue,
      // Suggestions are already computed for the current input; don't let MUI
      // re-filter them (it would drop `@type:` style strings that don't contain
      // the raw input text).
      filterOptions: (candidateOptions: string[]) => candidateOptions,
      onInputChange: handleInputChange,
      onChange: handleChange,
    }),
    [handleChange, handleInputChange, inputValue, options, value],
  );

  const getSuggestion = useCallback(
    (insertValue: string) => suggestionByValue.get(insertValue),
    [suggestionByValue],
  );

  return {
    value,
    inputValue,
    mode,
    suggestions,
    getSuggestion,
    removeToken,
    getAutocompleteProps,
  };
}

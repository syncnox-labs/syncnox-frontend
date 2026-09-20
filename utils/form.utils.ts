export const isTextInput = (element: Element | null): boolean => {
  if (!element) return false;

  // Ant Design specific: Select search inputs and DatePicker inputs
  // should typically behave like non-text inputs for auto-save triggers,
  // because their main value change is triggered via dropdown selection (onChange),
  // not typing and blurring.
  if (element.classList.contains("ant-select-selection-search-input")) {
    return false;
  }
  
  // Ant Design InputNumber needs to trigger on blur because users type in it.
  if (element.classList.contains("ant-input-number-input")) {
    return true;
  }

  const tagName = element.tagName.toLowerCase();
  
  if (tagName === "textarea") return true;
  
  if (tagName === "input") {
    const type = (element as HTMLInputElement).type;
    return [
      "text",
      "email",
      "number",
      "password",
      "search",
      "tel",
      "url",
    ].includes(type);
  }
  
  return false;
};

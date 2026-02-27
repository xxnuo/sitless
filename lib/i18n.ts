type MessageName = Parameters<typeof browser.i18n.getMessage>[0];
type MessageSubstitutions = Parameters<typeof browser.i18n.getMessage>[1];

export function t(
  key: MessageName,
  substitutions?: MessageSubstitutions,
): string {
  return browser.i18n.getMessage(key, substitutions) || key;
}

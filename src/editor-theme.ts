import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const DARK_SYNTAX_COLORS = {
  comment: '#b8c0cc',
  keyword: '#ff9bf2',
  name: '#9dd7ff',
  type: '#d8b4fe',
  literal: '#ffd580',
  string: '#b9f6a5',
  regexp: '#89f7d0',
  operator: '#8be9fd',
  punctuation: '#e5e7eb',
  invalid: '#ff9a9a',
} as const

export const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: DARK_SYNTAX_COLORS.comment, fontStyle: 'italic' },
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], color: DARK_SYNTAX_COLORS.keyword },
  { tag: [tags.variableName, tags.propertyName, tags.attributeName, tags.labelName], color: DARK_SYNTAX_COLORS.name },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.tagName], color: DARK_SYNTAX_COLORS.type },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: DARK_SYNTAX_COLORS.literal },
  { tag: [tags.string, tags.character, tags.docString], color: DARK_SYNTAX_COLORS.string },
  { tag: [tags.regexp, tags.escape], color: DARK_SYNTAX_COLORS.regexp },
  { tag: [tags.operator, tags.arithmeticOperator, tags.logicOperator, tags.compareOperator, tags.updateOperator], color: DARK_SYNTAX_COLORS.operator },
  { tag: [tags.punctuation, tags.separator, tags.bracket], color: DARK_SYNTAX_COLORS.punctuation },
  { tag: [tags.meta, tags.annotation, tags.macroName], color: DARK_SYNTAX_COLORS.type },
  { tag: tags.invalid, color: DARK_SYNTAX_COLORS.invalid, textDecoration: 'underline' },
])

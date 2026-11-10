'use client';

import { useSyncExternalStore } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditor, Position } from 'monaco-editor';
import { expressionFunctions, expressionVariables } from '@traceai/nodes';

const LANGUAGE_ID = 'traceai-expr';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribe(callback: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function getSnapshot() {
  return window.matchMedia(DARK_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

// Runs before the editor is created. Registers our tiny "language" once.
function registerExpressionLanguage(monaco: Monaco) {
  const alreadyDone = monaco.languages
    .getLanguages()
    .some((language: { id: string }) => language.id === LANGUAGE_ID);
  if (alreadyDone) return;

  monaco.languages.register({ id: LANGUAGE_ID });

  // Typing "{" also inserts "}", so "{{" becomes "{{}}".
  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
    brackets: [
      ['{', '}'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });

  // Colours: plain text stays plain, everything inside {{ }} is highlighted.
  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/\{\{/, { token: 'delimiter', next: '@expr' }],
        [/[^{]+/, ''],
        [/\{/, ''],
      ],
      expr: [
        [/\}\}/, { token: 'delimiter', next: '@pop' }],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\d+(\.\d+)?/, 'number'],
        [/[a-zA-Z_]\w*/, 'identifier'],
        [/[^\s\w}]+/, 'operator'],
        [/\s+/, ''],
      ],
    },
  });

  // The suggestion list. Only shows when the cursor is inside {{ }}.
  monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
    triggerCharacters: ['{'],
    provideCompletionItems(model: MonacoEditor.ITextModel, position: Position) {
      const textBefore = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const lastOpen = textBefore.lastIndexOf('{{');
      const lastClose = textBefore.lastIndexOf('}}');
      const insideExpression = lastOpen !== -1 && lastClose < lastOpen;
      if (!insideExpression) return { suggestions: [] };

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const variables = expressionVariables.map((variable) => ({
        label: variable.name,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: variable.name,
        detail: variable.description,
        range,
      }));

      const functions = expressionFunctions.map((fn) => ({
        label: fn.name,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: `${fn.name}(\${1})`,
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: fn.signature,
        documentation: fn.description,
        range,
      }));

      return { suggestions: [...variables, ...functions] };
    },
  });
}

type ExpressionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
};

export function ExpressionEditor({
  value,
  onChange,
  multiline = false,
}: ExpressionEditorProps) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className="overflow-hidden rounded-md border">
      <Editor
        height={multiline ? 96 : 38}
        language={LANGUAGE_ID}
        value={value}
        theme={isDark ? 'vs-dark' : 'light'}
        beforeMount={registerExpressionLanguage}
        onMount={(editor, monaco) => {
          // One-line fields: block Enter, unless it is accepting a suggestion.
          if (!multiline) {
            editor.addCommand(
              monaco.KeyCode.Enter,
              () => {},
              '!suggestWidgetVisible',
            );
          }
        }}
        onChange={(next) => onChange(next ?? '')}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'off',
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 8,
          lineNumbersMinChars: 0,
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          renderLineHighlight: 'none',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          fontSize: 13,
          automaticLayout: true,
          contextmenu: false,
          padding: { top: 8, bottom: 8 },
          scrollbar: { vertical: 'auto', horizontal: 'hidden' },
          quickSuggestions: { other: true, comments: false, strings: false },
          suggest: { showWords: false },
        }}
      />
    </div>
  );
}
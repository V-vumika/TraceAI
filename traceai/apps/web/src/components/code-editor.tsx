'use client';

import { useSyncExternalStore } from 'react';
import Editor from '@monaco-editor/react';

type CodeEditorProps = {
  value: string;
  language: 'javascript' | 'json';
  onChange: (value: string) => void;
  height?: number;
};

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

export function CodeEditor({
  value,
  language,
  onChange,
  height = 180,
}: CodeEditorProps) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className="overflow-hidden rounded-md border">
      <Editor
        height={height}
        language={language}
        value={value}
        theme={isDark ? 'vs-dark' : 'light'}
        onChange={(next) => onChange(next ?? '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          tabSize: 2,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
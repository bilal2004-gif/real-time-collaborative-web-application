import { useEffect, useRef } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import { basicSetup, EditorView } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { yCollab } from 'y-codemirror.next';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

type Props = {
  doc: Y.Doc;
  awareness: Awareness | null;
  connected: boolean;
};

export default function CodeEditor({ doc, awareness, connected }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current || !awareness) return;

    const extensions: Extension[] = [
      basicSetup,
      javascript(),
      oneDark,
      EditorView.lineWrapping,
      yCollab(doc.getText('code'), awareness),
      EditorView.theme({
        '&': { height: '100%', backgroundColor: '#171a24' },
        '.cm-scroller': { overflow: 'auto', fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace' },
        '.cm-gutters': { backgroundColor: '#171a24', border: 'none', color: '#555b6d' },
        '.cm-activeLineGutter': { backgroundColor: '#202431' },
        '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.025)' },
        '.cm-cursor': { borderLeftWidth: '2px' },
        '.cm-selectionBackground': { background: '#343e5c !important' },
      }),
    ];
    const view = new EditorView({
      state: EditorState.create({ extensions }),
      parent: hostRef.current,
    });

    return () => view.destroy();
  }, [doc, awareness]);

  return (
    <div className={`code-editor ${connected ? '' : 'editor-disconnected'}`} ref={hostRef} aria-label="Collaborative code editor" />
  );
}

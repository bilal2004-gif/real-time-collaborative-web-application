import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as Y from 'yjs';
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  Eraser,
  FileCode2,
  MousePointer2,
  Pencil,
  PenTool,
  Share2,
  Sparkles,
  Trash2,
  Undo2,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import CodeEditor from './CodeEditor';
import Whiteboard, { type Stroke } from './Whiteboard';

type Participant = { id: string; name: string; color: string };
type RoomState = { update: string; strokes: Stroke[] };
type Tool = 'pen' | 'eraser' | 'select';

const palette = ['#4149e8', '#f06b4f', '#23a987', '#f1a42b', '#a25bd1', '#1d2433'];

function makeRoomId() {
  return Math.random().toString(36).slice(2, 9);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function randomColor() {
  return palette[Math.floor(Math.random() * palette.length)];
}

export default function App() {
  const [roomId] = useState(() => {
    const url = new URL(window.location.href);
    let id = url.searchParams.get('room');
    if (!id || !/^[a-zA-Z0-9_-]{1,48}$/.test(id)) {
      id = makeRoomId();
      url.searchParams.set('room', id);
      window.history.replaceState({}, '', url);
    }
    return id;
  });
  const [name, setName] = useState(
    () => localStorage.getItem('canvas-user-name') || `Guest ${Math.floor(10 + Math.random() * 89)}`,
  );
  const [activeTab, setActiveTab] = useState<'code' | 'board'>('code');
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(palette[0]);
  const [copied, setCopied] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [roomName, setRoomName] = useState('Untitled workspace');
  const socketRef = useRef<Socket | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const socket = io({
      autoConnect: true,
      reconnection: true,
      auth: { roomId, name, clientId: doc.clientID },
    });
    docRef.current = doc;
    awarenessRef.current = awareness;
    socketRef.current = socket;

    awareness.setLocalStateField('user', { name, color: randomColor() });
    doc.on('update', (update, origin) => {
      if (origin !== 'remote' && socket.connected) {
        socket.emit('y-update', bytesToBase64(update));
      }
    });
    awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      if (!socket.connected) return;
      const changed = [...added, ...updated, ...removed];
      if (changed.length) {
        socket.emit('awareness-update', bytesToBase64(encodeAwarenessUpdate(awareness, changed)));
      }
      },
    );

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-room', { roomId, name: nameRef.current, clientId: doc.clientID });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('room-state', (state: RoomState) => {
      Y.applyUpdate(doc, base64ToBytes(state.update), 'remote');
      socket.emit('y-update', bytesToBase64(Y.encodeStateAsUpdate(doc)));
      setStrokes(state.strokes);
      setReady(true);
      setSyncError('');
      socket.emit(
        'awareness-update',
        bytesToBase64(encodeAwarenessUpdate(awareness, [doc.clientID])),
      );
    });
    socket.on('y-update', (update: string) => {
      Y.applyUpdate(doc, base64ToBytes(update), 'remote');
    });
    socket.on('awareness-update', (update: string) => {
      applyAwarenessUpdate(awareness, base64ToBytes(update), 'remote');
    });
    socket.on('awareness-remove', (clientId: number) => {
      removeAwarenessStates(awareness, [clientId], 'remote');
    });
    socket.on('presence', (members: Participant[]) => setParticipants(members));
    socket.on('board-stroke', (stroke: Stroke) => {
      setStrokes((current) => [...current, stroke]);
    });
    socket.on('board-undo', (id: string) => {
      setStrokes((current) => current.filter((stroke) => stroke.id !== id));
    });
    socket.on('board-clear', () => setStrokes([]));
    socket.on('sync-error', (message: string) => setSyncError(message));

    return () => {
      socket.disconnect();
      awareness.destroy();
      doc.destroy();
      docRef.current = null;
      awarenessRef.current = null;
      socketRef.current = null;
    };
  }, [roomId]);

  useEffect(() => {
    awarenessRef.current?.setLocalStateField('user', { name, color: randomColor() });
    localStorage.setItem('canvas-user-name', name);
    socketRef.current?.emit('set-name', name);
  }, [name]);

  const shareRoom = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setSyncError('Could not copy the invite link. Copy it from your browser address bar.');
    }
  }, []);

  const addStroke = useCallback((stroke: Stroke) => {
    setStrokes((current) => [...current, stroke]);
    socketRef.current?.emit('board-stroke', stroke);
  }, []);

  const undoStroke = useCallback(() => socketRef.current?.emit('board-undo'), []);
  const clearBoard = useCallback(() => socketRef.current?.emit('board-clear'), []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Canvas home">
          <span className="brand-mark"><PenTool size={17} strokeWidth={2.2} /></span>
          <span>canvas<span className="brand-period">.</span></span>
        </a>

        <div className="topbar-divider" />

        <button className="workspace-switcher" onClick={() => setRoomMenuOpen((open) => !open)}>
          <span className="workspace-icon"><FileCode2 size={16} /></span>
          <span className="workspace-title">{roomName}</span>
          <ChevronDown size={14} className={roomMenuOpen ? 'rotate-icon' : ''} />
        </button>
        {roomMenuOpen && (
          <input
            className="workspace-name-input"
            autoFocus
            value={roomName}
            maxLength={40}
            onChange={(event) => setRoomName(event.target.value)}
            onBlur={() => setRoomMenuOpen(false)}
            onKeyDown={(event) => event.key === 'Enter' && setRoomMenuOpen(false)}
            aria-label="Workspace name"
          />
        )}

        <div className="topbar-spacer" />
        <div className={`connection-pill ${connected ? 'is-online' : ''}`}>
          <span className="connection-dot" />
          {connected ? 'Live' : 'Connecting'}
        </div>
        <div className="topbar-divider topbar-divider-short" />
        <div className="presence-stack" aria-label={`${participants.length} people in this room`}>
          {participants.slice(0, 3).map((participant) => (
            <button
              className="avatar"
              key={participant.id}
              title={participant.name}
              style={{ backgroundColor: participant.color }}
              onClick={() => {
                const nextName = window.prompt('What should others call you?', name);
                if (nextName?.trim()) setName(nextName.trim().slice(0, 32));
              }}
            >
              {getInitials(participant.name)}
            </button>
          ))}
          {participants.length > 3 && <span className="avatar avatar-more">+{participants.length - 3}</span>}
          {participants.length === 0 && (
            <button className="avatar avatar-self" title={name} onClick={() => {
              const nextName = window.prompt('What should others call you?', name);
              if (nextName?.trim()) setName(nextName.trim().slice(0, 32));
            }}>
              {getInitials(name)}
            </button>
          )}
        </div>
        <button className="invite-button" onClick={shareRoom}>
          {copied ? <Check size={15} /> : <Share2 size={15} />}
          {copied ? 'Copied!' : 'Invite'}
        </button>
      </header>

      <div className="workspace">
        <aside className="rail">
          <div className="rail-group">
            <button className="rail-button rail-active" title="Workspace"><Sparkles size={18} /></button>
            <button className="rail-button" title="People" onClick={() => window.alert(`${participants.length} people are here right now.`)}><Users size={18} /></button>
          </div>
          <div className="rail-bottom">
            <span className={`rail-status ${connected ? 'status-online' : ''}`} title={connected ? 'Connected' : 'Disconnected'}>
              {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            </span>
            <button className="rail-avatar" title={`Signed in as ${name}`} onClick={() => {
              const nextName = window.prompt('What should others call you?', name);
              if (nextName?.trim()) setName(nextName.trim().slice(0, 32));
            }}>
              {getInitials(name)}
            </button>
          </div>
        </aside>

        <section className="main-panel">
          <div className="document-heading">
            <div className="document-title-group">
              <span className="eyebrow">YOUR SHARED SPACE</span>
              <h1>{roomName}</h1>
              <p>Think out loud. Build something brilliant.</p>
            </div>
            <div className="document-meta">
              <span className="saved-indicator"><span className="saved-dot" /> All changes synced</span>
              <span className="meta-divider" />
              <span className="room-id">ROOM <strong>{roomId}</strong></span>
            </div>
          </div>

          <div className="editor-card">
            <div className="editor-topline">
              <div className="tabs" role="tablist" aria-label="Workspace view">
                <button
                  className={`tab ${activeTab === 'code' ? 'tab-active' : ''}`}
                  role="tab"
                  aria-selected={activeTab === 'code'}
                  onClick={() => setActiveTab('code')}
                >
                  <Code2 size={15} /> Code
                  <span className="tab-file">index.js</span>
                </button>
                <button
                  className={`tab ${activeTab === 'board' ? 'tab-active' : ''}`}
                  role="tab"
                  aria-selected={activeTab === 'board'}
                  onClick={() => setActiveTab('board')}
                >
                  <PenTool size={15} /> Whiteboard
                  {strokes.length > 0 && <span className="board-count">{strokes.length}</span>}
                </button>
              </div>
              <div className="editor-actions">
                <span className="collab-label"><span className="collab-pulse" /> {participants.length || 1} here</span>
                <button className="share-icon-button" onClick={shareRoom} title="Copy invite link">
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            </div>

            {activeTab === 'code' ? (
              <div className="code-workspace">
                <div className="file-strip">
                  <span className="file-tab"><Code2 size={14} /> index.js <span className="file-dot" /></span>
                  <span className="file-strip-spacer" />
                  <span className="language-label"><span className="js-badge">JS</span> JavaScript</span>
                </div>
                <div className="editor-body">
                  {ready && docRef.current ? (
                    <CodeEditor
                      doc={docRef.current}
                      awareness={awarenessRef.current}
                      connected={connected}
                    />
                  ) : (
                    <div className="editor-loading"><span className="loading-spinner" /> Connecting to your workspace…</div>
                  )}
                </div>
                <div className="editor-statusbar">
                  <div className="status-left">
                    <span><span className="status-live-dot" /> {connected ? 'Synced' : 'Reconnecting'}</span>
                    <span className="status-separator">/</span>
                    <span>JavaScript</span>
                  </div>
                  <div className="status-right">
                    <span>UTF-8</span><span>LF</span><span>Spaces: 2</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="board-workspace">
                <div className="board-toolbar">
                  <div className="tool-group" aria-label="Whiteboard tools">
                    <button className={`tool-button ${tool === 'select' ? 'tool-selected' : ''}`} onClick={() => setTool('select')} title="Select"><MousePointer2 size={16} /></button>
                    <button className={`tool-button ${tool === 'pen' ? 'tool-selected' : ''}`} onClick={() => setTool('pen')} title="Draw"><Pencil size={16} /></button>
                    <button className={`tool-button ${tool === 'eraser' ? 'tool-selected' : ''}`} onClick={() => setTool('eraser')} title="Erase"><Eraser size={16} /></button>
                  </div>
                  <span className="toolbar-divider" />
                  <div className="color-options" aria-label="Stroke color">
                    {palette.map((swatch) => (
                      <button
                        key={swatch}
                        className={`color-swatch ${color === swatch ? 'color-selected' : ''}`}
                        style={{ '--swatch': swatch } as CSSProperties}
                        onClick={() => { setColor(swatch); if (tool !== 'pen') setTool('pen'); }}
                        title={`Use ${swatch}`}
                      />
                    ))}
                    <button className="color-swatch eraser-swatch" onClick={() => setTool('eraser')} title="Erase strokes"><span /></button>
                  </div>
                  <span className="toolbar-divider toolbar-divider-right" />
                  <button className="tool-button toolbar-action" onClick={undoStroke} title="Undo last stroke"><Undo2 size={16} /></button>
                  <button className="tool-button toolbar-action clear-action" onClick={clearBoard} title="Clear board"><Trash2 size={15} /></button>
                  <span className="toolbar-hint">{tool === 'select' ? 'Select tool' : tool === 'eraser' ? 'Erase strokes' : 'Draw anything'}</span>
                </div>
                <Whiteboard
                  strokes={strokes}
                  tool={tool}
                  color={tool === 'eraser' ? '#ffffff' : color}
                  onStroke={addStroke}
                />
                <div className="board-footer">
                  <span><span className="status-live-dot" /> Changes sync live</span>
                  <span>Every good idea starts somewhere</span>
                </div>
              </div>
            )}
          </div>
          <footer className="page-footer">
            <span>Made for making things together</span>
            <span className="footer-heart">✳</span>
            <span>Share the link to invite someone in</span>
          </footer>
        </section>
      </div>

      {syncError && (
        <div className="error-toast" role="status">
          <span>{syncError}</span>
          <button onClick={() => setSyncError('')} aria-label="Dismiss notification">×</button>
        </div>
      )}
    </main>
  );
}

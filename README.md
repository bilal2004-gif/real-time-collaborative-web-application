# Canvas

A real-time shared workspace with a collaborative JavaScript editor and whiteboard. Code edits use Yjs so concurrent changes merge; Socket.IO synchronizes documents, whiteboard strokes, undo/clear actions, and room presence without page refreshes.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually `http://localhost:5173`). Use **Invite** to copy the room URL and open it in another browser or share it with a collaborator.

## Production

```sh
npm run build
npm start
```

The server listens on port `3001` by default. Set `PORT` to change it. Room documents and whiteboard strokes are held in server memory, so they remain available to connected collaborators but are cleared when the server restarts.

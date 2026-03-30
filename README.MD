About the Project
Prism is a modern personal media server with a web interface designed for streaming and managing your media collection (video, audio, photos) across any device in your network. The project balances ease of deployment with a robust security system.

Development Phases
Production Practice: Development of a secure file interface (CRUD, RBAC, sandboxing).

Diploma Thesis: Implementation of media streaming, FFmpeg metadata processing, and playback sessions.

Key Features
Secure File Manager: Full CRUD operations with strict access control (Path Traversal protection).

RBAC (Role-Based Access Control): Flexible roles and permissions system.

Adaptive Streaming: Support for playback on various devices, from modern PCs to legacy hardware.

Tech Stack
Backend: Node.js (Fastify) + MongoDB (Mongoose).

Frontend: Vue 3 (Composition API) + Tailwind CSS.

Tools: FFmpeg (Metadata/Thumbnails), JWT, Jest (TDD), Chokidar (FS Watcher), fastq (Job Queue), music-metadata, load-esm.
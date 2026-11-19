---
# Answers to the Bloxity SDK integration questions (docs.bloxity.io, used by audit_sdk / review).
canDie: false # falling off the lane only teleports you back to the hub: no death, no loss
hasScore: true # leaderboards: total-earned, jump-power, rebirths (declared in src/config.js, reported by the server)
rewards: true # one rewarded ad: the "Free Boost" offer (config ADS), granted only on `completed`
notApplicable:
  - feature: death-screen
    reason: The player cannot die. Falling below the world only respawns them at their base (R / respawn_request), with no penalty.
  - feature: gems
    reason: By design nothing in this game costs a premium currency; every price is in-game money (see CLAUDE.md).
  - feature: party-own-server-flow
    reason: The game runs on Bloxity-hosted servers, where party play is automatic (SDK loaded from the pinned v1 URL before matchmaking, matchmaker via net.resolveEndpoint, room maxClients = 6). The enable / getLaunch / joined / failed flow is only for self-hosted servers.
  - feature: custom-characters
    reason: When a custom character is worn the kit's dress() returns null and the game falls back to the standard avatar; the character GLB itself is not drawn.
---

# Jump to Reach the Sky: Bloxity integration notes

SDK integrations in the client (`src/bloxity.js` is the only place that calls the SDK):

- init, loading steps, `loadingEnd` + `gameplayStart` after the first frame, `gameplayEnd` on unload
- auth (`onUserChanged`) and the player's token, sent to the game server which verifies it with Bloxity
- settings: `graphics_quality`, `camera_sensitivity`, `show_fps`, `fullscreen`, `master_volume`,
  `music_volume` (ambience bed), `enable_chat` (chat bubbles), `background_transparency` (window panels)
- avatar + proportions, avatar customizer (drawn by Boxity), `respawn_request`, `portal.showMenu` on Esc
- reserved UI areas (the HUD keeps clear of Boxity's toolbar and chat)
- ads: break handlers (pause + mute), `declareScreens` (`panel`, `gameplay`), banner ads while a window
  is open, one rewarded ad placement `free-boost`
- leaderboards: `leaderboard.define` (client) + hosted score reports (server, `src/reporter.ts` in the backend)
- chat bubbles over the local player, emotes (`registerFeature('emotes')`, `play_emote`, the catalogue clip
  player in `src/avatar/emotes.js`)
- character kit: `Legion.SDK.character.dress` on the game's own rig (`avatar.getOutfitKey()`, `handle.update` on look
  changes), with the manual cosmetics path as the fallback (`src/main.js` loadAvatar / lookChanged)
- party play: automatic on Bloxity hosting (pinned SDK URL, matchmaker, `maxClients` 6 = room size)
- Open Rooms: the backend runs the room reporter (`src/legion-room-reporter.ts`), the client reports its room with
  `updateRoom` and joins a `?roomId=` launch through the pod's relay (`locateRoom`)
- multiplayer: matchmaker `net.resolveEndpoint`, `updateRoom`, the `?roomId=` launch room, friend-join toasts
  (`playerJoined` / `playerInRoom`); room size = the number of bases in the hub

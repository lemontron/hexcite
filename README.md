Play Hexcite at https://hexcite.app/

Visit once online to cache the game and all 50 practice boards for offline play.
Updates apply after closing and reopening Hexcite.

---

<img src="https://i.ibb.co/svnwwRbm/hexcite1.png" alt="hexcite1">

I've been hearing a lot about reverse engineering video games recently, so I thought I'd give it a go. I made this in
the bath tub while sick. It was done in a few hours, over 2 conversations. The first prompt yeilded a playable
game with a computer player and working mechanics. I'll continue to improve it.

In Hexcite, you play shapes onto a board of 7 hexagons. The opening move is placed on the center hexagon along its inner
edges. Players then take turns placing pieces until both players run out of moves. 5 pts are awarded for each edge that
touches an adjacent piece, but placing a partial overlap is not allowed. In the end, the player with the most points
wins. Lastly, covering an entire outer hexagon awards 10 or 30 bonus points.

Practice mode includes all 50 original GB boards, with placements, inventories, scores, and starting
states. Select any board from the title screen. Win to mark it cleared and advance.

## iOS

Connect and unlock your iPhone, then run `npm run ios` to rebuild, install, and launch Hexcite.
If multiple iPhones are available, pass the device ID with `npm run ios -- <device ID>`.
If you use multiple signing teams, set `DEVELOPMENT_TEAM` to the team ID for the build.

## Android

Set up the Android SDK (including API 36) and JDK 21, then connect an Android phone
with USB debugging enabled or start an emulator. Run `npm run android` to rebuild,
install, and launch Hexcite. To select a device, pass `-- --target <device ID>`.


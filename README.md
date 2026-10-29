# JotDrop for Joplin

**All your notes as Google Keep-style cards, right inside Joplin.**

> Prototype. Not yet in the Joplin plugin repository.

JotDrop adds a board to Joplin: open it and every note you already have shows up as a card. Pinned notes stay on top, cards get a colour, and you can tick a checklist without opening the note. It works on Joplin desktop and on Joplin for Android.

JotDrop for Joplin is part of [JotDrop](https://jotdrop.net/), the private Google Keep alternative. JotDrop is also available for [Obsidian, Android, the web and Chrome](https://github.com/Diexar-Labs/jotdrop).

## What you get

- **Every note is a card.** Nothing to convert: your existing notes appear as they are, newest first, in Keep-style columns.
- **Pin and colour.** Pinned notes stay on top. Ten soft paper colours, each with a name, so you never have to rely on colour alone.
- **Tick checklists on the card.** ☐ becomes ☑ and the note is updated. The card stays where it is.
- **Take a note.** A note bar at the top of the board, like in Keep.
- **Find it fast.** Search, filter by notebook and by tag.
- **Photos, links and due dates** on the card: the first photo as a cover, one chip per website, and Joplin's own to-do dates.
- **Light and dark**, following your Joplin theme. English and Dutch.

## Your notes stay yours

The board only reads and writes your notes through Joplin's own plugin API. Colour and pin are stored as plugin data on the note, so the text of your note stays untouched. They sync with Joplin's own sync (and its end-to-end encryption, when you turn that on). The plugin makes no network requests.

## Try the prototype

1. Build it (see below) or ask for the `.jpl` file.
2. In Joplin, open **Tools > Options > Plugins** (Android: **Configuration > Plugins**, then **Enable plugin support**).
3. Choose **Install from file** and pick `net.jotdrop.joplin.jpl`. Restart Joplin.
4. Desktop: click the board button in the editor toolbar, or **View > Open JotDrop board**. Android: tap the puzzle button at the top and **Open JotDrop board**.

The first time, JotDrop creates one note called **JotDrop**. That note is the board.

## Build

Requires Node.js 20 or newer.

```sh
npm ci
npm run typecheck
npm test
npm run build        # dist/ and publish/net.jotdrop.joplin.jpl
npm run check:shared # is the shared card code still the same as JotDrop's website?
```

For development, start Joplin desktop with `--dev-plugins <path to dist>`.

## License

MIT. See [LICENSE](LICENSE).

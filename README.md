<div align="center">

<img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/hero.png" alt="JotDrop for Joplin, a Google Keep style card view plugin that shows your Joplin notes as colorful cards on desktop and Android" width="820" />

# JotDrop for Joplin

### Your Joplin notes. Now as cards.

The free, open-source **Google Keep style card view for Joplin**, on **Joplin desktop** and **Joplin for Android**.<br/>
Every note you already have becomes a card you can pin, color, drag and tick off.<br/>
Nothing to convert. No account needed. Your notes stay in Joplin.<br/>
Want to capture on the go? Notes from the **JotDrop app** can land on your board through **JotDrop Cloud**.

[**Get it**](#get-jotdrop-for-joplin) · [**Features**](#features) · [**On your phone**](#on-your-phone) · [**From the JotDrop app**](#from-the-jotdrop-app-into-joplin) · [**How it works**](#how-it-works) · [**JotDrop app and Cloud**](#the-rest-of-jotdrop-android-app-and-jotdrop-cloud) · [**FAQ**](#faq) · [**jotdrop.net**](https://jotdrop.net/)

[![License: MIT](https://img.shields.io/badge/License-MIT-f4c458.svg)](LICENSE) [![Joplin plugin](https://img.shields.io/badge/Joplin-plugin-14213d)](#get-jotdrop-for-joplin) [![npm](https://img.shields.io/npm/v/joplin-plugin-jotdrop?color=14213d&label=npm)](https://www.npmjs.com/package/joplin-plugin-jotdrop) [![Platforms](https://img.shields.io/badge/Desktop%20%2B%20Android-14213d)](#get-jotdrop-for-joplin)

</div>

> ### Free. No account needed. The cloud is your choice.
>
> JotDrop for Joplin costs nothing and needs no sign-up. It adds a board to the Joplin you already use, and your notes keep using Joplin's own sync, whichever sync target you chose. It only talks to the internet if you connect JotDrop Cloud yourself, to bring in notes from the JotDrop app.

---

## Why JotDrop for Joplin? A Google Keep view for your notes

Joplin is great at keeping everything: notebooks, Markdown, sync on your terms. What it doesn't have is that quick, visual overview where a thought lands on a card and you see it at a glance. JotDrop adds exactly that, and leaves the rest of Joplin alone:

- **Every note is a card.** Open the board and the notes you already have show up, in Keep-style columns. No import and no second copy.
- **See more, open less.** Read a shopping list, tick an item and spot a due date without opening the note.
- **Your own order.** Drag a card to where you want it, and it stays there.
- **Still just Joplin.** Your text stays in your note. Notebooks, tags, search, sync and your end-to-end encryption settings all stay the same.
- **Desktop and phone.** The same board on Joplin desktop and Joplin for Android.
- **Open source.** MIT-licensed. Read the code, run it, change it.

## See it in action

<p align="center">
  <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/demo.webp" alt="Animation of the JotDrop board in Joplin: ticking a checklist item on a card, pinning a note, choosing a color, dragging a card to a new place and searching all notes" width="820" />
</p>

Tick a task, pin a note, pick a color, drag a card, find a note by a word inside it. That's the real plugin in Joplin desktop, with made-up demo notes.

## All the little things, at a glance

<p align="center">
  <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/board.webp" alt="JotDrop card view in Joplin desktop with pinned notes on top and colorful note cards below" width="820" />
</p>

A card shows what matters: the title and text, ticked tasks with a line through them, the first photo as a cover, one chip per website you linked to, your tags and a due date. Pinned cards get a strip of tape and stay on top.

## Get JotDrop for Joplin

| Where | How |
| --- | --- |
| **Joplin desktop** | **Tools > Options > Plugins**, search for **JotDrop**, install, restart Joplin if it asks |
| **Joplin for Android** | **Configuration > Plugins**, **Enable plugin support**, search for **JotDrop**, install |

Then open the board:

- **Desktop:** click the board button in the editor toolbar, or **View > Open JotDrop board**.
- **Android:** tap the puzzle button at the top, then **Open JotDrop board**.

The first time, JotDrop creates a notebook called **JotDrop** with one note in it. That note is the board. Quick notes go to this notebook too, unless you have filtered the board on another notebook. From then on the board opens when Joplin starts; you can turn that off under **Options > JotDrop**.

Requires Joplin 3.5 or newer. On iPhone and iPad, Joplin only allows the plugins it recommends itself, so JotDrop is not available there.

## Features

### Organize

- **Pin** what matters to the top.
- **Ten soft paper colors**, each with its name, so you never have to rely on color alone.
- **Your own order.** Drag with the mouse, or on a phone hold a card for a moment first. Cards stay where you put them, also when you tick something.
- **Archive.** Move a card off the board without deleting anything, and bring it back whenever you like.

### Capture

- **Take a note.** A note bar at the top of the board, like in Keep.
- **Tick checklists on the card.** ☐ becomes ☑, and your note is updated.
- **Reminders.** Pick later today, tomorrow, next week or your own moment. JotDrop uses Joplin's own to-do alarm, so the reminder also works without the board.

### Find

- **Full-text search** through all your notes, using Joplin's own search index.
- **Filter** by notebook and by tag, with one tap.
- **Fast with many notes.** Tested with 5,000 notes on desktop and 2,000 on Android: the board only fetches the cards near your screen.

### Look

- **Light and dark**, following your Joplin theme.

<table>
  <tr>
    <td align="center" width="50%">
      <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/colors.webp" alt="Choosing a named color for a note card in the JotDrop board for Joplin" />
      <br/><sub>Every color has a name.</sub>
    </td>
    <td align="center" width="50%">
      <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/reminder.webp" alt="Setting a reminder on a note card with Joplin's own to-do alarm" />
      <br/><sub>Reminders run on Joplin's own alarm.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/search.webp" alt="Searching all Joplin notes from the JotDrop board" />
      <br/><sub>The note you can't find, found.</sub>
    </td>
    <td align="center" width="50%">
      <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/screenshot-board.png" alt="The JotDrop board in Joplin's dark theme" />
      <br/><sub>Follows your Joplin theme, dark included.</sub>
    </td>
  </tr>
</table>

## On your phone

Joplin for Android's own note list only shows titles. With JotDrop you get the whole board, with your thumb.

<table>
  <tr>
    <td align="center" width="33%">
      <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/phone-board.webp" alt="JotDrop card view on Joplin for Android with pinned notes and a note bar" />
      <br/><sub>Pinned on top, the rest below.</sub>
    </td>
    <td align="center" width="33%">
      <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/phone-more.webp" alt="Note cards with photos, tags and due dates in JotDrop for Joplin on Android" />
      <br/><sub>Photos, tags and due dates on the card.</sub>
    </td>
    <td align="center" width="33%">
      <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/phone-reminder.webp" alt="Setting a reminder from a card in JotDrop for Joplin on Android" />
      <br/><sub>Remind me later, in two taps.</sub>
    </td>
  </tr>
</table>

**Allow notifications.** On Android 13 and newer, allow notifications for Joplin in your phone settings. Joplin only asks for this in its own alarm screen and a plugin cannot ask for it, so without it a reminder set from the board stays silent.

## From the JotDrop app into Joplin

The [JotDrop Android app](#the-jotdrop-android-app) is made for catching things on the go: share a link from any app, dictate, record a voice memo, turn a photo into text. Connect JotDrop Cloud, and all of that shows up on your Joplin board as ordinary notes.

> Speak a thought into your phone. It travels end-to-end encrypted through JotDrop Cloud. Joplin on your desktop brings it in as a normal note, and Joplin's own sync takes it to your other devices.

**Connect in a minute**

1. In the JotDrop app, open **JotDrop Cloud** and tap **Create pairing code**. On [app.jotdrop.net](https://app.jotdrop.net/) you find it under **Connected devices**.
2. On the board in Joplin desktop, click **JotDrop Cloud** at the top and paste the code.
3. Choose which notes come in:
   - **Only new notes.** What is already in your cloud stays out of Joplin. This is the default, so nobody's Joplin fills up by surprise.
   - **Everything.** All notes already in your cloud come in too.

The button then shows **✓ Cloud**. Click it to see how it is going, to check right away, or to disconnect. Disconnecting keeps the notes that came in.

**What comes along:** text, photos, voice memos (they play on the card), other files, colors, pins, labels and hashtags as Joplin tags, and reminders as Joplin's to-do alarm.

**Who wins:** your Joplin. A note you edited or removed in Joplin is never overwritten or brought back. As long as you did not touch it, a change in the app updates it here. A note you delete in the app stays in Joplin.

**Good to know**

- **It goes one way.** Notes you make in Joplin do not go to the JotDrop app.
- **Desktop does the fetching, while Joplin is open.** It looks every 30 seconds. Notes made while Joplin is closed come in after you open it. On Joplin for Android you see them through Joplin's own sync; connecting from Android itself is not possible.
- **Connect one computer.** Joplin's own sync takes the notes to your other devices. A second connected computer makes no duplicate notes, but if both bring in the same photo before they sync, Joplin can add a note called "Attachment conflict".
- **Encryption ends at your Joplin.** On the way through JotDrop Cloud a note is end-to-end encrypted. Once it is a Joplin note, Joplin's settings apply: its own end-to-end encryption is optional and off by default, so turn it on if your sync target should not read your notes.
- **Joplin counts as a device.** The free plan has 2: your phone and one Joplin. Attachments follow your plan's file size. See [the plans](#jotdrop-cloud).
- **Repeating reminders** come in with their first date only.
- **Archive and trash** in the app stay out of Joplin.

## How it works

JotDrop for Joplin is deliberately simple plumbing:

- **The board is one special note** that Joplin shows as a full-screen view. It stays out of the cards itself.
- **Your text is not touched** by color, pin, archive or a card's place. Those are stored as plugin data on the note, and they travel along with Joplin's own sync and its end-to-end encryption, when you turn that on.
- **Ticking a box or writing a quick note** does change your note, because that is what you asked for. It stays a normal Joplin note.
- **A reminder** is the one thing that changes how a note behaves in Joplin. Joplin only has alarms for to-dos, so a plain note becomes a to-do when you set one. Remove the reminder and it is a plain note again.
- **Everything on your computer goes through Joplin's plugin API.** Without JotDrop Cloud the plugin makes no network requests and needs no account.
- **With JotDrop Cloud connected,** Joplin desktop asks the cloud for new notes every 30 seconds. It decrypts them on your computer with a key the server never sees. Its data about what came in stays in the plugin's own folder, and nothing is ever sent back.

Uninstall the plugin and your notes are still your Joplin notes. Only the board note and its notebook stay behind, and you can delete those.

## The rest of JotDrop: Android app and JotDrop Cloud

JotDrop for Joplin is part of [JotDrop](https://jotdrop.net/), the private Google Keep alternative. You don't need any of the below to use the board. It is there if you want to [catch notes on your phone and find them in Joplin](#from-the-jotdrop-app-into-joplin), if you ever want Keep-style notes outside Joplin, or for someone you know who does.

### The JotDrop Android app

A separate, native notes app with the same kind of cards. Share links, text and images to it from any app, dictate, record a voice memo, turn a photo into text, and set repeating reminders. Your notes are plain Markdown files in a folder on your phone, and it works without an account.

<table>
  <tr>
    <td align="center" width="33%">
      <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/app-board.webp" alt="JotDrop Android app, a Google Keep alternative, with voice memo, checklist and photo cards" />
      <br/><sub>Voice memos, lists and photos on cards.</sub>
    </td>
    <td align="center" width="33%">
      <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/app-more.webp" alt="Link previews, reminders and repeating reminders on cards in the JotDrop Android app" />
      <br/><sub>Link previews and repeating reminders.</sub>
    </td>
    <td align="center" width="33%">
      <img src="https://raw.githubusercontent.com/Diexar-Labs/joplin-plugin-jotdrop/main/images/app-menu.webp" alt="The side menu of the JotDrop Android app with labels, archive, trash and JotDrop Cloud" />
      <br/><sub>Labels, archive, trash and Cloud.</sub>
    </td>
  </tr>
</table>

Get it from the [JotDrop releases on GitHub](https://github.com/Diexar-Labs/jotdrop/releases). There are also a [JotDrop plugin for Obsidian](https://community.obsidian.md/plugins/jotdrop), a [web app](https://app.jotdrop.net/) and a [Chrome clipper](https://chromewebstore.google.com/detail/jotdrop-web-clipper/mkgcicjljogifeaccaclbcoemllmgjfo) that works together with the Obsidian desktop plugin.

### JotDrop Cloud

The optional, end-to-end encrypted sync for the JotDrop app, the Obsidian plugin and the web app, and the way their notes reach Joplin. Each note and attachment is encrypted on your device with AES-256-GCM before it leaves, so the server holds no readable copy. It does see account details such as your email address, your devices and the size and time of your files. A time machine lets you look back at an earlier moment and restore it.

| | **Free** | **Plus** |
| --- | --- | --- |
| Encrypted cloud storage | 250 MB | 10 GB |
| Connected devices | 2 | No plan limit |
| Largest synced file | 25 MB | 200 MB |
| Time machine | 30 days | Full available history |
| End-to-end encryption | Included | Included |

Current prices are on the [JotDrop pricing page](https://jotdrop.net/#pricing). The free plan needs no payment details. All of it is explained in the [JotDrop repository](https://github.com/Diexar-Labs/jotdrop#jotdrop-cloud).

**Joplin users:** your Joplin notes do not go to JotDrop Cloud. Notes only travel from the cloud into Joplin, and Joplin's own sync keeps doing the rest. Want to move notes to JotDrop instead? Export them from Joplin as Markdown with resources (not JEX) and import them in JotDrop.

## FAQ

**Is there a card view or grid view for Joplin?**
Yes, that's what this plugin is. Joplin's own note list stays as it is; JotDrop adds a full-screen board that shows all your notes as cards, on desktop and Android.

**Does it change my notes?**
Color, pin, archive and order are stored as plugin data, so your text stays untouched. Ticking a checkbox updates that line in the note, and a reminder makes the note a to-do until you remove the reminder.

**Does it work with my sync?**
It sits on top of Joplin's own sync, so it follows whichever target you use. We tested it between desktop and Android over WebDAV, and between two desktops through a shared folder.

**Are my notes encrypted?**
That is up to your Joplin settings. Joplin's end-to-end encryption is optional and off by default. Turn it on in Joplin and the plugin data travels with it.

**Do I need a JotDrop account or JotDrop Cloud?**
Not for the board. Without JotDrop Cloud the plugin has no account, no server and no network requests of its own. You only need the cloud to bring in notes from the JotDrop app, and the free plan is enough for a phone and one Joplin.

**Can notes from the JotDrop app appear in Joplin?**
Yes. [Connect JotDrop Cloud](#from-the-jotdrop-app-into-joplin) on Joplin desktop and they come in as ordinary notes. It goes one way, and whatever you changed in Joplin stays as you left it.

**Are notes from JotDrop Cloud still encrypted in Joplin?**
On the way, yes, end to end. In Joplin they are normal notes, so Joplin's own encryption setting applies.

**Does it work on iPhone or iPad?**
No. On iOS, Joplin only allows the plugins it recommends itself.

**Why is there an extra note called JotDrop?**
That note is the board. Joplin shows it as the full-screen view, and it never appears as a card.

**Will it keep up with thousands of notes?**
We tested it with 5,000 notes on desktop and 2,000 on Android. The board only fetches the cards near your screen.

## Known issues

- **Two devices, one note.** If two devices change the plugin data of the same note before they sync, only the change of the device that syncs first stays. This is about colors, pins and order, not about your text.
- **Long words on a phone.** A long word in a card title can break in the middle of the word.
- **First open.** The first time, you open the board yourself. After that it opens when Joplin starts.
- **Renamed and edited at once.** A note that gets a new file name and new text in the same sync comes in as a new note. The JotDrop app does not rename notes when you edit them.

## Contributing

This is a project shared in the open. Bug fixes, translations and small features that keep JotDrop simple are welcome. For bigger ideas, open an issue first to talk about it.

## Contact

- Bugs and ideas: [open an issue](https://github.com/Diexar-Labs/joplin-plugin-jotdrop/issues/new). Issues are public, so never paste passwords or private notes.
- Anything else: hello@jotdrop.net

## Support

The plugin is free. If JotDrop saves you time and you feel like saying thanks:

<a href="https://ko-fi.com/L3L11ZETB9"><img src="https://img.shields.io/badge/Ko--fi-Support%20me-FF5E5B?logo=ko-fi&logoColor=white" alt="Ko-fi" /></a>

No obligations. Totally optional.

## Build

Requires Node.js 20 or newer.

```sh
npm ci
npm run typecheck
npm test
npm run build        # dist/ and publish/net.jotdrop.joplin.jpl
npm run check:shared # is the shared card and cloud code still the same as JotDrop's?
```

For development, start Joplin desktop with `--dev-plugins <path to dist>`.

## Credits

Built by [Diexar Labs](https://github.com/Diexar-Labs) on [Joplin's plugin API](https://joplinapp.org/help/api/get_started/plugins). Inspired by Google Keep (the good parts). JotDrop is an independent project and is not affiliated with Joplin or Google.

The sample video card in the Android app photos shows *Big Buck Bunny* by the Blender Foundation, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), used without endorsement.

## License

MIT. See [LICENSE](LICENSE).

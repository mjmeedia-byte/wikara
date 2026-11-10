# Daily Limits

A Chrome extension (Manifest V3) that limits how long you spend on distracting sites each day, with separate rules for YouTube and deliberate friction against loosening your own limits.

Plain JavaScript, HTML and CSS. No build step, no libraries, no network requests. Everything it stores stays in `chrome.storage.local` on your machine.

This folder is self-contained. It has nothing to do with the Wikara packages elsewhere in this repository.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right). It has to stay on: recent versions of Chrome disable unpacked extensions when Developer mode is switched off.
3. Click **Load unpacked** and choose this `daily-limits` folder (the one containing `manifest.json`).
4. Pin the extension to the toolbar so the popup is one click away.
5. Chrome will say the extension can "read your browsing history" and "read and change your data on youtube.com". [Permissions](#permissions) explains why.

Requires Chrome 120 or newer.

### Allow in Incognito

An extension cannot switch this on by itself. Until you do, an Incognito window is a free pass.

1. Open `chrome://extensions`.
2. Find **Daily Limits** and click **Details**.
3. Turn on **Allow in Incognito**.

Time spent in Incognito then counts toward the same limits. One difference: Chrome does not let this kind of extension show its own pages inside an Incognito tab. A blocked Incognito tab shows Chrome's generic "blocked" error instead of the normal block page, and a notification says which limit was hit.

## How it works

### Site limits

- Add a site by domain (`reddit.com`) with a daily limit in minutes. `0` means always blocked.
- Subdomains count toward the same site: `m.reddit.com` and `old.reddit.com` both use `reddit.com`'s time.
- Time counts only while the site is in use: its tab is the active tab, the Chrome window has focus, and you have touched the keyboard or mouse in the last 60 seconds.
- A tab that is playing audio counts regardless, including in the background and while you are "idle". This is what makes watching a film count.
- When a limit runs out, every tab on that site is replaced by the block page, and new visits are intercepted.
- You get a notification when 5 minutes and when 1 minute remain.
- Limits reset at local midnight.
- If a host falls under two entries (say `reddit.com` and `old.reddit.com`), it counts toward both and is blocked when either runs out. Adding an entry can therefore never loosen anything.

### YouTube

YouTube is not a normal site entry. It has one allowance, **YouTube entertainment**, and these rules:

| What                                                                  | Rule                                              |
| --------------------------------------------------------------------- | ------------------------------------------------- |
| Shorts (any URL with `/shorts`)                                       | Always blocked. No allowance.                     |
| Video from a channel on the educational list                          | Always allowed, never counted.                    |
| Video in YouTube's **Education** or **Science & Technology** category | Always allowed, never counted.                    |
| Any other video, and any video that cannot be classified              | Entertainment. Uses the allowance.                |
| Home, subscriptions, playlists, channel pages not on the list         | Entertainment browsing. Uses the allowance.       |
| Search results, and channel pages of listed channels                  | Never counted, never blocked.                     |
| Embedded YouTube players on other sites                               | Replaced with a link to the video on youtube.com. |

When the entertainment allowance is used up (or set to `0`):

- entertainment watch pages show the block page;
- the home feed, the recommendation sidebar and end-of-video suggestions are hidden;
- search and educational videos keep working.

How a video is classified, in order:

1. **Channel.** The video's channel is on the educational list. Entries are matched by channel ID (`UC…`). An entry added by `@handle` matches by handle until one of its videos is seen, then it is pinned to that channel's ID. Display names are never compared, so a copycat channel name does not pass.
2. **Category.** The category YouTube stores with the video is Education or Science & Technology. It is read from data already in the page. No API key and no extra requests.
3. **Otherwise entertainment.** That includes any video whose data could not be read within 8 seconds.

The player is paused and hidden on every watch page until this check finishes, and the check runs again on every in-page navigation.

Embedded players are replaced because an embed carries no category, so it cannot be classified. Pages on the always-allowed list keep their embeds (Khan Academy lessons are YouTube embeds).

### Always allowed

Sites on this list are never counted or blocked, and cannot be added to the site list. It starts with `khanacademy.org` and `wikipedia.org`.

## Changing settings

Open the popup and click **Settings**, or right-click the toolbar icon and choose **Options**.

Every change is one of two kinds.

| Tightening (applies immediately)           | Loosening (typing challenge, then a delay) |
| ------------------------------------------ | ------------------------------------------ |
| Add a site                                 | Remove a site                              |
| Lower a limit                              | Raise a limit                              |
| Remove a channel from the educational list | Add a channel to the educational list      |
| Remove a site from the always-allowed list | Add a site to the always-allowed list      |
| Cancel a pending change                    | Change either friction setting, up or down |
|                                            | Import settings, or reset to defaults      |

Buttons that start a loosening change end in "…".

A loosening change goes like this:

1. A dialog shows 150 random characters, drawn as an image so they cannot be selected or copied. You type them exactly. Pasting, drag-and-drop and auto-fill are refused. Capitals matter; spaces and line breaks do not.
2. The change is queued. It takes effect 24 hours later.
3. Until then it sits under **Pending changes** with a countdown. Cancelling is immediate.

There is no "five more minutes" button, no pause and no override, on the block page or anywhere else.

Other details:

- The challenge length (50–1000 characters) and the delay (1–168 hours) are settings. Changing them is itself a loosening change and uses the friction currently in force.
- **Export** writes your settings to a JSON file and is free. **Import** and **Reset** replace everything, so they are loosening changes.
- If you remove a site and add it back the same day, it keeps the time already used.
- A pending change is applied as written when its time comes. If you queue "raise reddit.com to 60" and then lower it to 10, it still becomes 60 when the delay ends, unless you cancel it.

## Clock changes

- Usage is stored against an absolute day window. The day only rolls over when the clock passes the stored midnight.
- If the clock moves **backwards**, today's usage stays exactly as it was and nothing resets early. Setting the clock to 23:59 "yesterday" and waiting a minute does not reset anything.
- The 24 hour delay is measured from the latest time the extension has ever seen, so winding the clock back before queueing a change does not shorten the wait.
- Moving the clock **forwards** cannot be detected without an outside time source. See the next section.

## What this cannot stop

This is a speed bump for weak moments. It is not a lock. Each of these gets round it:

| Bypass                                                                                                                              | What happens                                                                                                                                                               | Best practical countermeasure                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Disable or remove the extension in `chrome://extensions` (or right-click the icon and remove it)                                    | All limits are gone. Removing also deletes usage and settings.                                                                                                             | Nothing inside an extension can prevent this. To raise the cost, have someone else set the Chrome policy `URLBlocklist` to include `chrome://extensions` using an administrator account you do not have the password for. That still leaves the toolbar's remove option.                   |
| Turn off Developer mode                                                                                                             | Chrome disables unpacked extensions.                                                                                                                                       | Same as above.                                                                                                                                                                                                                                                                             |
| Edit the extension's files (for example the developer flag) and reload                                                              | Any rule can be changed.                                                                                                                                                   | Keep the folder somewhere you would have to go looking for. There is no real defence.                                                                                                                                                                                                      |
| Open DevTools on the options page or service worker                                                                                 | Storage can be edited directly and the challenge text can be read.                                                                                                         | Chrome policy `DeveloperToolsAvailability` set to `2`, again by someone else.                                                                                                                                                                                                              |
| Use another browser, another Chrome profile or Guest mode                                                                           | No extension there.                                                                                                                                                        | Install it in every profile you use, remove browsers you do not need, and consider the policies `BrowserGuestModeEnabled: false` and `BrowserAddPersonEnabled: false`. A second layer outside the browser (a hosts-file or router block for the worst sites) covers every browser at once. |
| Incognito window                                                                                                                    | Not covered until you allow it.                                                                                                                                            | Turn on **Allow in Incognito** (above), or disable Incognito with the policy `IncognitoModeAvailability: 1`.                                                                                                                                                                               |
| Your phone, tablet or another computer                                                                                              | Not covered at all.                                                                                                                                                        | Use that device's own limits (Screen Time, Digital Wellbeing) with a passcode someone else holds.                                                                                                                                                                                          |
| Set the system clock forward                                                                                                        | Starts a new day and matures pending changes. Setting it back afterwards does not give a second reset: the next one happens only when real time passes the later midnight. | Leave automatic time on. On a shared or managed machine, remove your right to change the clock.                                                                                                                                                                                            |
| Mirrors, proxies and alternative front ends (translation proxies, archive sites, Invidious or Piped for YouTube, Reddit front ends) | They are different domains, so they are not limited.                                                                                                                       | Add each one to the site list when you catch yourself using it. Adding is instant.                                                                                                                                                                                                         |
| Limited sites embedded inside other pages                                                                                           | Only the tab's own address is checked, so an embedded post or player from a limited site is not counted. YouTube embeds are the exception: they are replaced.              | Add the embedding site if it becomes a habit.                                                                                                                                                                                                                                              |
| Videos an uploader has filed under Education or Science & Technology                                                                | They count as educational whatever they contain.                                                                                                                           | That is the rule as specified. To rely on the channel list only, empty `EDU_CATEGORIES` in `src/lib/rules.js`.                                                                                                                                                                             |
| Silent viewing with no input on non-YouTube sites                                                                                   | After 60 seconds without keyboard or mouse you count as idle. A muted video on, say, Netflix then stops counting. On YouTube a playing video counts even when muted.       | Keep the sound on, or accept the gap.                                                                                                                                                                                                                                                      |
| Queueing a loosening change ahead of time                                                                                           | It works, 24 hours later.                                                                                                                                                  | That is the design. The pending list keeps it visible, and cancelling is one click.                                                                                                                                                                                                        |

## Known limits

- **YouTube's markup changes.** Hiding the Shorts shelf, sidebar link, feed and recommendations depends on CSS selectors in `src/content/yt.css`. If something reappears, add its selector there. Blocking does not depend on them: Shorts URLs and entertainment watch pages are stopped by address.
- **Category names.** The category check expects YouTube's English names. If YouTube reports categories in another language, those videos fall back to entertainment. The channel list still works.
- **Timing.** Limits are enforced to within a second or two while Chrome is running normally. If Chrome delays the worker's alarm, a block can land up to about 30 seconds late. Elapsed time is still counted correctly.
- **Sleep.** If the computer sleeps with a limited site in front, at most 70 seconds of the sleep is counted.
- **Idle threshold.** The 60 seconds before you count as idle are themselves counted.
- **Incognito block page.** See [Allow in Incognito](#allow-in-incognito).
- **Back button.** Going back from the block page returns to the blocked address, which is blocked again.

## Permissions

| Permission                                                  | Why it is needed                                                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                                   | Keeps settings, pending changes and today's usage in `chrome.storage.local`. Short-lived per-tab notes go in `chrome.storage.session`.                    |
| `alarms`                                                    | Wakes the service worker to bank elapsed time, at midnight, and when a pending change is due. Without alarms the worker would be unloaded and lose track. |
| `idle`                                                      | Tells whether you have been away from the keyboard and mouse for 60 seconds.                                                                              |
| `tabs`                                                      | Reads each tab's address and whether it is playing audio, to know which limited site is in use, and replaces blocked tabs with the block page.            |
| `webNavigation`                                             | Sees a navigation as it starts, including YouTube's in-page navigations, so a blocked page is intercepted before it loads.                                |
| `notifications`                                             | The 5 minute and 1 minute warnings, and the notice for blocked Incognito tabs.                                                                            |
| Content scripts on `youtube.com` and `youtube-nocookie.com` | Read the video's channel and category, hold the player until the check finishes, hide Shorts and the feed, and replace embedded players.                  |

Not requested: access to all sites, `scripting`, `declarativeNetRequest`, `history`, `cookies`. Outside YouTube the extension sees addresses only, never page content. It makes no network requests.

Chrome words `tabs` and `webNavigation` as "Read your browsing history". The extension keeps no history: it stores a running total per limited site for the current day.

## For developers

```
manifest.json
src/
  background.js        service worker: events, sync loop, alarms, messages
  lib/
    config.js          constants and the developer flag
    domains.js         domain, YouTube URL and channel parsing
    usage.js           day window, time accounting, clock-jump handling
    rules.js           verdict for a URL: count, block or allow
    settings.js        defaults, validation, tightening vs loosening
  content/
    yt-main.js         page world: reads YouTube's video data
    yt-content.js      holds the player, reports to the worker
    yt-embed.js        embedded players on other sites
    yt.css             hides Shorts, feed and recommendations
  pages/               popup, options page, block page, shared CSS
tests/                 unit tests for src/lib
```

The service worker is the only writer of state. It keeps nothing important in memory: each event loads state from storage, banks the time since the last saved timestamp against the sites that were in use then, re-checks every tab, saves, and sets alarms. Events are processed one at a time.

### Developer flag

`src/lib/config.js` has `DEV_FAST_MODE`, off by default. Set it to `true` and reload the extension to test quickly:

- one "minute" of limit lasts one second (a limit of 20 is 20 seconds; warnings come at 5 and 1 seconds left);
- the 24 hour delay becomes 1 minute;
- the worker ticks every second.

The popup and options page show a banner while it is on. Set it back to `false` before real use. `TESTING.md` is a manual checklist built around this flag.

### Unit tests

```bash
npm test
```

Runs Node's built-in test runner over `tests/`. No dependencies to install.

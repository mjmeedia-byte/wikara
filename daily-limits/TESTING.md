# Manual test checklist

Run these with the developer flag on, so minutes last seconds.

## Setup

1. In `src/lib/config.js` set `DEV_FAST_MODE = true`.
2. In `chrome://extensions` click the reload arrow on Daily Limits. Open YouTube tabs reload themselves.
3. Open the popup. It should show "Developer fast mode is on".

With the flag on: a limit of `20` lasts 20 seconds, warnings come at 5 and 1 seconds left, and each hour of loosening delay lasts 2.5 seconds (24 hours is 1 minute).

Two things you will use below:

- **The worker console.** `chrome://extensions` → Daily Limits → **service worker** link.
- **Today's raw numbers.** In the worker console:

  ```js
  chrome.storage.local.get('usage').then(({ usage }) => console.log(usage.used));
  ```

When you are done, set the flag back to `false` and reload. Usage from the test run will then be read in real minutes, so it is effectively zero.

## 1. A limit running out mid-session

- [ ] In Settings add `example.com` with a limit of `20`. It appears at once, with no challenge.
- [ ] Open `https://example.com` and keep the tab in front. The popup's bar for `example.com` fills about one second per second.
- [ ] At 5 seconds left and at 1 second left a notification appears.
- [ ] At 20 seconds the tab turns into the block page. It shows the site name, time used today, the limit and the reset time. It has no link to settings, no "more time" button and no override.
- [ ] Open `https://www.example.com` in a new tab. It goes straight to the block page.
- [ ] Add `example.org` with a limit of `0`. Opening it shows "always blocked" immediately.
- [ ] Try to add `en.wikipedia.org`. It is refused because `wikipedia.org` is always allowed.

## 2. What counts as time

Add `example.net` with a limit of `300` first.

- [ ] Open `example.net`, then switch to another tab for 10 seconds. Its time does not move.
- [ ] Put `example.net` in front, then click a different application so Chrome loses focus for 10 seconds. Its time does not move.
- [ ] Put `example.net` in front and do not touch the keyboard or mouse. After about 60 seconds the time stops moving. It resumes when you move the mouse.

## 3. Background audio

- [ ] Add a site that plays sound (a radio or music site) with a limit of `300`. Start playback.
- [ ] Switch to another tab. The site's time keeps going.
- [ ] Pause playback. Within a few seconds the time stops.

## 4. The service worker restarting

- [ ] Open a limited site with plenty of time left. Note its used time in the popup, and the time on a clock.
- [ ] Open `chrome://serviceworker-internals`, find the entry whose scope starts with `chrome-extension://` and the extension's ID, and click **Stop**. Do this three or four times over 20 seconds, keeping the limited tab in front in another window.
- [ ] Open the popup. Used time went up by the same amount as the clock, within a second or two. Nothing was lost and nothing was counted twice.
- [ ] Quit Chrome completely with the limited tab open, wait a minute, start it again. The time you were away is not counted. Used time is where you left it.

## 5. The midnight reset

Either wait for real midnight, or move midnight closer. In the worker console:

```js
chrome.storage.local.get('usage').then(({ usage }) => {
  usage.day.end = Date.now() + 15000;
  return chrome.storage.local.set({ usage });
});
```

(This is also a demonstration of the DevTools bypass listed in the README.)

- [ ] Before the 15 seconds are up, run out a limit so a tab is on the block page.
- [ ] After 15 seconds the popup shows every site back at zero.
- [ ] The block page changes to "available again" and offers a link back to the site.
- [ ] The popup's "Resets at" shows midnight again.

## 6. Moving the clock backwards

- [ ] Use up part of a limit. Note the used time.
- [ ] Set the system clock back two hours. Used time is unchanged, and it keeps counting from there when you use the site.
- [ ] Set the clock to 23:59 on the previous day and wait two minutes. Usage does **not** reset.
- [ ] Put the clock right again.

## 7. Shorts

Set the YouTube allowance to something comfortable first, such as `300`.

- [ ] Open any `https://www.youtube.com/shorts/…` address. It goes to the block page, which says Shorts are always blocked.
- [ ] On the YouTube home page there is no Shorts shelf.
- [ ] The sidebar has no Shorts link, in both its wide and collapsed forms.
- [ ] Search for something popular. No Shorts shelf and no Shorts among the results.
- [ ] Open a channel that posts Shorts. There is no Shorts tab and no Shorts shelf.
- [ ] Open `https://www.youtube.com/@<any channel>/shorts`. Block page.

If any Shorts surface is still visible, the block still holds (clicking it lands on the block page), but the selector list in `src/content/yt.css` needs the new element name.

## 8. An educational video and an entertainment video

- [ ] Open a video from a seeded channel (Khan Academy, Veritasium, …). It plays. Watch for 15 seconds: YouTube entertainment time in the popup does not move, apart from a fraction of a second while the video was being checked.
- [ ] Open a video that is not from a listed channel but is in the Education category (many university lectures are). Same result.
- [ ] Open a music video or a gaming video. It plays, and YouTube entertainment time goes up.
- [ ] On each of these, watch the moment the page opens: the player area is blank with a small "Checking this video…" note, then the video starts. Nothing plays before that.
- [ ] Open the YouTube home page and leave it in front. Entertainment time goes up (browsing counts).
- [ ] Open a search results page. Entertainment time does not move.

## 9. In-page YouTube navigation

- [ ] Set the YouTube allowance to `20` and let an entertainment video use it all. The tab becomes the block page.
- [ ] Open a video from a seeded channel. It plays.
- [ ] The recommendation sidebar next to it is hidden.
- [ ] Use YouTube's search box (do not type a new address) and click an entertainment video in the results. The page changes without a full reload, and the tab lands on the block page without the video playing.
- [ ] Go back to the educational video and let it finish with autoplay on. If the next video is entertainment, it is blocked.
- [ ] Open the YouTube home page. The feed is hidden and a short note explains why.
- [ ] Search still works and educational results still play.
- [ ] On a page with a YouTube video embedded (a blog post, a search engine's video preview), the player is replaced by an "Open this video on YouTube" link. On `khanacademy.org` embedded lessons play normally.

## 10. The loosening flow, start to finish

- [ ] In Settings change a site's limit to a **lower** number. The button reads "Lower now" and the change applies at once.
- [ ] Change it to a **higher** number. The button reads "Raise…". Click it. The typing dialog opens with 10 characters and says the change applies immediately.
- [ ] Try to select or copy the characters. You cannot: they are an image.
- [ ] Copy any text elsewhere and paste into the box. Nothing is inserted.
- [ ] Type a wrong character. The dialog says which character does not match, and "Apply change" stays disabled.
- [ ] Type all 10 correctly. "Apply change" enables. Click it. The new limit is in place straight away and nothing is pending.

Now test the delay. Under **Friction** set the delay to `24` and click **Change…**, then type the challenge. With the developer flag on, 24 hours is one minute.

- [ ] Raise a limit again. This time the dialog says the change is queued, and the button reads "Queue change".
- [ ] After typing, the change appears under **Pending changes** with a countdown of about one minute. The limit itself has **not** changed yet.
- [ ] Click **Cancel** on it. It disappears immediately and the limit never changes.
- [ ] Repeat, and this time wait. When the countdown reaches zero the limit changes without you doing anything, and the pending entry disappears.
- [ ] Each of these also opens the typing dialog: **Remove…** on a site, **Add channel…**, **Add site…** under Always allowed, **Change…** under Friction, **Import…**, **Reset to defaults…**.
- [ ] Each of these applies at once with no dialog: adding a site, **Remove** on a channel, **Remove** on an always-allowed site.
- [ ] Remove a site that has some time used, let the removal apply, then add the site again. Its used time is still there.
- [ ] Close and reopen Chrome while a change is pending. It is still listed, with the same due time.

## 11. Incognito

- [ ] Turn on **Allow in Incognito** (README, Install).
- [ ] Open a limited site in an Incognito window. Its time goes up in the popup.
- [ ] Run the limit out. The Incognito tab leaves the site and shows Chrome's "blocked" error, and a notification names the limit.

## 12. Back to normal

- [ ] Set `DEV_FAST_MODE = false` and reload the extension.
- [ ] The banner is gone and limits read in minutes.
- [ ] Set **Friction** back to the values you want for real use (10 characters and no delay is the default).

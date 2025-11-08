# O Cinema Voicemail Dashboard - Staff Guide

## Overview

The O Cinema voicemail system automatically records messages from customers who call the theater and allows staff to review, listen to, and manage these messages through a web-based dashboard.

**📊 Visual Diagram:** See the complete [voicemail lifecycle diagram](diagrams/staff/voicemail-lifecycle.mmd) for how messages flow from caller to staff.

---

## Accessing the Dashboard

### Dashboard URL
**Production:** `https://miami-theater-voice-agent.vercel.app/api/voicemail/dashboard`

### Login Process

**📊 Visual Diagram:** See the [login flow diagram](diagrams/staff/login-flow.mmd) for the complete authentication process.

1. Visit the dashboard URL in your web browser
2. Enter the **Access Password** provided by your manager
   - This is a secure token that authenticates staff access
   - Keep this password confidential
3. Click **Access Dashboard**

**Note:** Your login session is saved in your browser, so you won't need to re-enter the password unless you:
- Logout manually
- Clear your browser data
- Use a different browser or device

### Security Features

- **Rate Limiting**: After 5 failed login attempts, your IP address will be temporarily blocked for 15 minutes
- **Secure Session**: Your session persists in browser storage for convenience
- **HTTPS Only**: All communications are encrypted

---

## Dashboard Features

### Auto-Refresh
- The dashboard automatically refreshes every **30 seconds**
- New voicemails appear without needing to reload the page
- You can continue working while the dashboard updates in the background

### Dashboard Statistics
At the top of the dashboard, you'll see three key metrics:
- **Total Voicemails** - All voicemails currently in the system
- **Unlistened** - Voicemails that haven't been played yet
- **Transcribed** - Voicemails with available transcriptions

---

## Understanding Voicemail Cards

Each voicemail appears as a card showing:

### Header Information
- **Phone Icon (📞)** - Caller identifier avatar
- **Phone Number** - The caller's number (e.g., +1234567890)
- **Date/Time** - When the voicemail was received
- **Duration Badge** - Length of the recording in seconds

### Transcription Section

**📊 Visual Diagram:** See the [transcription states diagram](diagrams/staff/transcription-states.mmd) to understand how transcriptions progress through different states.

The transcription area shows one of four states:

#### ✅ **Completed Transcription**
```
"This is the caller's message transcribed to text..."
```
- Light gray background
- Shows the full transcription in quotes
- **Action:** Read the text to understand the caller's message

#### ⏳ **Pending Transcription**
```
⏳ Transcription processing... (2 minutes ago)
```
- Gray italicized text
- Shows how long ago the voicemail was received
- Usually completes within 2-5 minutes
- **Action:** Wait for transcription or listen to audio

#### ⚠️ **Failed Transcription**
```
⚠️ Transcription unavailable - Twilio was unable to transcribe this recording.
Please listen to the audio.
```
- Yellow/orange warning background with border
- Means the transcription service couldn't process the audio (poor audio quality, background noise, etc.)
- **Action:** You must listen to the recording directly

#### ⏱️ **Timed Out Transcription**
```
⏱️ Transcription unavailable - Processing took too long. Please listen to the audio.
```
- Yellow/orange warning background with border
- Appears after 10 minutes if no transcription arrives
- Usually indicates a system issue
- **Action:** You must listen to the recording directly

### Action Buttons

Each voicemail card has three action buttons:

1. **🎧 Listen to Recording** (Purple button)
   - Opens the audio recording in a new browser tab
   - Plays the actual voicemail message
   - Always available, even if transcription failed
   - Streams directly from Twilio's servers

2. **⬇️ Download MP3** (Gray button)
   - Downloads the voicemail as an MP3 file to your computer
   - Useful for saving important messages locally
   - Can be shared with other staff members if needed
   - File is named with the Recording ID for reference

3. **🗑️ Delete** (Red button)
   - Permanently removes the voicemail from the system
   - Requires confirmation before deleting
   - **Cannot be undone** - use carefully!
   - Use this to clean up after addressing voicemails

---

## Email Notifications

Staff receive **two email notifications** for each voicemail:

### 1. Immediate Notification
**Subject:** `New Voicemail from [phone number]`

**Contains:**
- Caller's phone number
- Recording duration (in seconds)
- Timestamp when received
- Direct link to listen to recording
- Note: "Transcription pending..."

**When:** Sent immediately when the voicemail recording completes

**Purpose:** Alerts you instantly that a customer left a message

### 2. Transcription Notification
**Subject:** `Voicemail Transcription from [phone number]`

**Contains:**
- Full transcription text
- Caller information
- Recording duration
- Direct link to listen to recording

**When:** Sent 30 seconds to 5 minutes after the first email (once transcription completes successfully)

**Purpose:** Provides the text version for quick scanning

**Important Note:** If transcription fails, you will **not** receive a second email. Check the dashboard to see the failure status indicated by the yellow warning box.

---

## Common Tasks

### Reviewing New Voicemails

1. Check the **Unlistened** count at the top of the dashboard
2. Look for new voicemail cards (newest messages appear at the top)
3. Read the transcription if available
4. If transcription failed or you need clarity, click **🎧 Listen to Recording**
5. Take appropriate action based on the message content

### Responding to Customers

The voicemail system is **receive-only** - you cannot respond directly through the dashboard. To follow up with customers:

1. Note the caller's phone number from the voicemail card
2. Use your regular phone system to call them back
3. Reference the voicemail content when you call
4. Optionally download the MP3 if you need to save their message for records

### Managing Storage

To keep the dashboard organized and prevent storage issues:

1. **Delete old voicemails** that have been addressed
2. Click the **🗑️ Delete** button on voicemails you no longer need
3. Confirm the deletion when prompted
4. The voicemail is permanently removed from the system (cannot be recovered)

**Best Practice:** Regularly delete voicemails after they've been handled to prevent the dashboard from becoming cluttered and to manage storage costs.

---

## Troubleshooting

### "Invalid password" Error
- Double-check you're using the correct Access Password
- Ensure there are no extra spaces before or after the password
- Contact your manager if you've forgotten the password
- **Security Note:** After 5 failed login attempts, your IP address will be temporarily blocked for 15 minutes

### "Rate limit exceeded" / "Too many attempts" Error
- You've exceeded 5 failed login attempts within 15 minutes
- Wait 15 minutes before trying again
- The system will automatically reset after the cooldown period
- If you continue to have issues, contact your manager

### Dashboard Not Loading
- Check your internet connection
- Verify you're using the correct dashboard URL
- Try refreshing the page (F5 or Cmd+R)
- Clear your browser cache and cookies, then try again
- Try a different browser (Chrome, Firefox, Safari all supported)
- Check if you're on a VPN or restrictive network that might block access

### Recording Won't Play
- Ensure your browser allows pop-ups from the dashboard URL
- Check that your device has audio output enabled and volume is up
- Try a different browser
- Download the MP3 instead and play it with your local media player

### Transcription Always Shows "Pending"
- Transcriptions typically take 30 seconds to 5 minutes
- If still pending after 10 minutes, it will automatically show as "Transcription unavailable"
- You can still listen to the audio recording
- This is usually due to poor audio quality or Twilio service delays

### No Email Notifications
- Check your spam/junk folder for emails from the system
- Verify with your manager that email notifications are properly configured
- Add the sender email to your contacts/safe sender list
- Email notifications are sent to the configured staff email address

### Auto-Refresh Not Working
- Check if you have any browser extensions blocking JavaScript
- Ensure you haven't disabled JavaScript in your browser settings
- Try manually refreshing the page
- If the issue persists, logout and login again

---

## Security Best Practices

### Protect Your Access Password
- **Never share** your dashboard password with unauthorized persons
- **Don't write it down** in plain text or store in unsecured locations
- Don't save it in browser password managers on shared computers
- Change the password periodically (contact your manager)

### Use Secure Connections
- Always access the dashboard via **HTTPS** (look for the lock icon in your browser)
- Don't access the dashboard from public/untrusted computers
- Avoid using public Wi-Fi networks when accessing sensitive customer data
- Always logout when using shared workstations

### Handle Caller Information Responsibly
- Voicemails may contain personal customer information (names, email addresses, etc.)
- Follow your organization's privacy policies and data protection regulations
- Don't share customer information with unauthorized persons
- Delete voicemails securely after they're no longer needed
- Don't forward recordings or transcriptions to personal email addresses

---

## Logout

To logout of the dashboard:

1. Click the **🚪 Logout** button in the top-right corner of the screen
2. You'll be returned to the login screen
3. Your password is cleared from the browser session
4. Always logout on shared computers to protect security

---

## Support

If you experience technical issues or need assistance:

1. Contact your IT administrator or manager
2. Report the issue with specific details:
   - What you were trying to do
   - What error message you saw (if any)
   - Which browser and version you're using
   - Your operating system
   - Screenshot of the error (if applicable)

---

## Technical Resources (For Developers)

For technical staff who need to understand the system architecture:

- **[System Architecture Diagram](diagrams/architecture-voicemail-system.mmd)** - Complete technical architecture
- **[Voicemail Sequence Diagram](diagrams/sequence-voicemail.mmd)** - Full webhook flow from Twilio
- **[Staff Access Sequence Diagram](diagrams/sequence-staff-access.mmd)** - Authentication and dashboard loading
- **[Redis Data Structures](diagrams/data-structure-redis.mmd)** - How voicemails are stored

---

## Viewing Mermaid Diagrams

The diagrams in this guide are written in Mermaid format (`.mmd` files). To view them:

1. **GitHub/GitLab**: Diagrams render automatically when viewing on these platforms
2. **Mermaid Live Editor**: Visit https://mermaid.live and paste the diagram code
3. **VS Code**: Install the "Mermaid Preview" extension
4. **Browser Extension**: Install a Mermaid viewer extension for your browser

---

## Quick Reference Card

| Action | How To |
|--------|--------|
| **Login** | Visit dashboard URL, enter password |
| **Listen to voicemail** | Click 🎧 Listen to Recording button |
| **Read transcription** | Look in gray box below caller info |
| **Download voicemail** | Click ⬇️ Download MP3 button |
| **Delete voicemail** | Click 🗑️ Delete button, confirm |
| **Logout** | Click 🚪 Logout button (top-right) |
| **Check new messages** | Look at "Unlistened" count at top |
| **Refresh manually** | Press F5 or Cmd+R (auto-refreshes every 30s) |

---

## Frequently Asked Questions

**Q: How long are voicemails kept in the system?**
A: Voicemails are kept indefinitely until manually deleted by staff. It's recommended to delete old voicemails regularly.

**Q: Can I respond to voicemails through the dashboard?**
A: No, the system is receive-only. You must call customers back using their phone number.

**Q: What's the maximum voicemail length?**
A: Callers can leave messages up to 3 minutes (180 seconds) long.

**Q: Why did a transcription fail?**
A: Common reasons include poor audio quality, heavy background noise, accented speech, or technical issues with Twilio's transcription service.

**Q: Can I access the dashboard on my mobile phone?**
A: Yes, the dashboard is responsive and works on mobile devices, though the experience is optimized for desktop browsers.

**Q: What happens if I delete a voicemail by accident?**
A: Deletion is permanent and cannot be undone. Always double-check before confirming deletion.

**Q: Can multiple staff members access the dashboard at the same time?**
A: Yes, multiple staff can be logged in simultaneously. All will see the same voicemails.

**Q: How do I know if someone else already responded to a voicemail?**
A: The system doesn't currently track this. Coordinate with your team to avoid duplicate responses.

---

**Last Updated:** 2025-01-08
**Version:** 1.0
**Questions?** Contact your system administrator

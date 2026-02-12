# Tracking Setup - First Customer Initiative

## Files to Create & Maintain

### 1. Prospect List
**File:** `notes/PROSPECT_LIST.csv`

Create this spreadsheet to track all prospects:

```csv
#,Name,Source,Contact,Email,Location,Status,Budget,Last Contact,Next Action
1,Example Name,Facebook Group,0987-123-456,email@gmail.com,Hanoi,Initial,150-200M,2026-02-15,Send demo link
```

**Update:** Daily as you make contacts
**Status options:** Initial, Contacted, Demo Requested, Demo Done, Hot Lead, Closed Won, Closed Lost

---

### 2. Daily Outreach Log
**File:** `notes/DAILY_LOG.md`

Track daily progress:

```markdown
# Daily Outreach Progress

## Day 4 (Feb 14, 2026)
**Activities:**
- Prospect research: 12 potential leads identified
- Messages sent: 5 (Zalo)
- Responses: 0
- Demos scheduled: 0
- Quotes sent: 0

**Hot leads:** None yet
**Next day focus:** Send more messages, add to prospect list

## Day 5 (Feb 15, 2026)
**Activities:**
- Messages sent: 3 more
- Responses: 2 (1 hot lead)
- Demo walk-throughs: 1 live demo
- Quotes sent: 0

**Hot leads:** Trần Hoa (very interested)
**Next day focus:** Do site visit with Trần Hoa

[Continue for each day...]
```

**Update:** At end of each day
**Minimum metrics:** Messages sent, Responses, Demos, Quotes, Hot leads count

---

### 3. Results Summary
**File:** `notes/OUTREACH_RESULTS.md`

Track conversion metrics:

```markdown
# Outreach Results Summary

## Week 1 (Feb 14-20)

### Activity Metrics
- Total contacts made: 10
- Response rate: 30% (3/10)
- Demo conversions: 2 (from 3 responses)
- Quote sendings: 1

### Pipeline Status
| Stage | Count |
|-------|-------|
| Initial Contact | 10 |
| Responded | 3 |
| Demo Done | 2 |
| Quote Sent | 1 |
| Meeting Scheduled | 1 |
| Verbal Agreement | 0 |
| Contract Signed | 0 |
| Payment Received | 0 |

### Hot Leads This Week
1. **Trần Hoa** - High intent, family decision pending
2. **Nguyễn Minh** - Medium intent, researching

[Update weekly with new data...]
```

**Update:** Weekly summary on Friday

---

## Analytics from System

### 2.1 PDF Generation Logging
After you add console.log, check server logs for:
```
[PDF_GENERATED] quote_id=abc-123 customer_id=xyz timestamp=2026-02-15T14:30:00Z
```

Create daily summary:
```markdown
## PDF Activity (Feb 15, 2026)
- PDFs generated: 2
- Customers: nguyen@example.com, tran@example.com
- System is being used ✓
```

---

### 2.2 PDF Download Logging
Check server logs for:
```
[PDF_DOWNLOADED] quote_id=abc-123 ip=xxx.xxx.xxx.xxx timestamp=2026-02-15T14:35:00Z
```

Track in spreadsheet:
```
Date,Quote ID,IP,Time,Notes
2026-02-15,abc-123,192.168.1.1,14:35,Downloaded from web demo
```

---

### 2.3 Counter Endpoint
Once you create `/api/public/stats/demo`, check daily:

```bash
curl http://localhost:3000/api/public/stats/demo
```

Response:
```json
{
  "pdfs_generated_24h": 2,
  "pdfs_downloaded_24h": 3,
  "quotes_submitted_24h": 0,
  "timestamp": "2026-02-15T23:59:00Z"
}
```

---

## Weekly Reporting Template

**Create:** `notes/WEEKLY_REPORTS.md`

```markdown
# Weekly Reports - First Customer Initiative

## Week 1 Report (Feb 14-20, 2026)

### Executive Summary
- Status: [on track / at risk / behind]
- Key achievement: [biggest win]
- Biggest blocker: [main challenge]

### Metrics
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Contacts made | 10 | 12 | ✅ |
| Response rate | 30% | 25% | 🟡 |
| Demos done | 2 | 1 | 🟡 |
| Quotes sent | 2 | 1 | 🟡 |
| Meetings scheduled | 1 | 1 | ✅ |

### Hot Leads This Week
1. Trần Hoa - Site visit scheduled for Wed
2. Nguyễn Minh - Waiting for spouse's approval

### Adjustments for Next Week
- Increase messaging volume (more cold outreach)
- Focus on hot leads (daily follow-up)
- [Other learnings...]

### Expected Outcome
By Feb 25: [prediction of payment status]
```

---

## Checkpoints

### Daily (5 min check-in)
```
□ Messages sent today? (At least 2-3)
□ Responses followed up? (Within 1 hour)
□ Demo scheduled? (If any inquiries)
□ Updated prospect list? (New contacts)
```

### Weekly (Friday end-of-day)
```
□ Updated OUTREACH_RESULTS.md
□ Calculated weekly metrics
□ Identified hot leads
□ Planned next week's targets
□ Adjusted messaging if needed
□ Week 1/2 checkpoint review
```

### Milestone (Feb 25)
```
□ 10+ prospects contacted
□ 2+ quotes sent
□ 1 contract signed
□ Payment received (PRIMARY GOAL)
```

---

## Success Metrics

**Primary goal:** 1 paying customer

**Supporting metrics:**
- Contacts made: 10+
- Response rate: 25%+
- Demos completed: 2+
- Quotes sent: 2+
- Contracts signed: 1
- Payment amount: 80M+ VND (60% of typical quote)

---

## Red Flags (When to Adjust)

If by **Day 7** you have:
- ❌ < 5 contacts → Increase outreach volume
- ❌ 0% response rate → Change messaging approach
- ❌ 0 demos → Lower barrier (phone call instead of form)
- ❌ No hot leads → Look for different prospect sources

**Adjustment strategy:**
1. Identify what's not working
2. Change ONE variable (message, target, channel)
3. Test for 3 days
4. Measure response rate
5. If better, keep it. If worse, revert.

---

## Tools You'll Use

### Spreadsheets
- Prospect list (CSV or Excel)
- Daily log (markdown)
- Results summary (markdown)

### System Tracking
- Server logs (PDF generation/download)
- `/api/public/stats/demo` endpoint
- Console output from backend

### Communication
- Zalo messages (track in spreadsheet)
- Email (track in spreadsheet)
- Phone calls (note in daily log)

---

## Sample Data Entry

### Adding a prospect to PROSPECT_LIST.csv
```csv
3,Phạm Sơn,Google Local Search,0967-890-123,phamson@yahoo.com,Hà Nội,Initial Contact,"150-180M",2026-02-15,"Send Zalo message"
```

### Updating DAILY_LOG.md
```markdown
## Day 5 (Feb 15, 2026) - Sunday
**Outreach:**
- Zalo messages sent: 3 more prospects
- Email sent: 2 (Nguyễn Minh, Trần Hoa)
- Phone calls: 0

**Responses:**
- Zalo replies: 2 (both positive!)
- Email replies: 0 (expected on weekends)
- Hot lead developed: Yes - Trần Hoa very interested

**Activity:**
- Live demo walk-through: 1 (with Trần Hoa on video call)
- Questions answered: 3 (price, timeline, warranty)
- Site visits scheduled: 1 (Trần Hoa - Monday 2pm)

**Tomorrow:**
- Do site visit with Trần Hoa
- Send follow-up to other respondents
- Research 3 more prospects
```

---

## One Last Thing

**Print this checklist and post it somewhere visible:**

```
☐ FIRST PAYING CUSTOMER - 14 DAY COUNTDOWN

Today's date: _______________
Days until Feb 25: __________

WEEK 1 TARGETS (by Feb 20):
☐ 10 prospects contacted
☐ 2-3 responded
☐ 1 demo completed

WEEK 2 TARGETS (by Feb 25):
☐ 2 quotes sent
☐ 1 contract signed
☐ 1 PAYMENT RECEIVED ← THIS IS THE GOAL

Don't get distracted. Focus on the goal. 🎯
```

You've got this. 💪

# KarachAir

KarachAir connects live air-quality and satellite heat data to student volunteers and the organizations that coordinate them. Live app: https://karachair.netlify.app

The steps below walk through the full loop: an organization registers, a volunteer signs up and joins it, the volunteer chats with the guide and accepts a mission, and the organization verifies the work and issues a certificate.

## 1. Register an organization

1. Open the app and go to the sign-in page. Choose the **Organization** tab, then **Register**.
2. Enter the **organization name** (a school or NGO), an **email** (used only to reset the passcode), and a **passcode** of at least 8 characters. Confirm the passcode.
3. Click **Create organization**. You land on the organization view, which includes the **Org portal** and **Report**.

Organizations show up in the list that volunteers choose from, so register the organization first.

## 2. Register a volunteer account

1. On the sign-in page, choose the **Volunteer** tab, then **Create account**.
2. Enter your **name**, **email** and **password** (at least 8 characters) and confirm the password. Click **Create account**.
3. Choose your organization from the list and click **Join organization**.
4. Optionally add a profile photo (webcam or upload), or choose "No thanks".

You land on the chat guide.

## 3. How the chatbot works

The chat guide, **Hawa**, helps a volunteer find a mission.

1. Hawa asks a few questions: your **area** of Karachi, what **kind of activity** you want (for example planting trees or reducing vehicle idling), and **indoor or outdoor**.
2. Type in your own words, or use the voice buttons to talk. The model that reads your request works in **English**.
3. Hawa suggests missions for that neighbourhood. Every mission takes **2 hours**, and each one shows its **reason**: the area's heat rank, live air quality (PM2.5) and green space.
4. **Safety lock:** outdoor missions need an adult and lock automatically when the air is hazardous. Indoor missions stay open.

Hawa is a trained text classifier plus a guided script, not a large language model.

## 4. Accept a mission

1. On a mission card, click **Accept** (or **Decline** to see another).
2. Fill in your school or group name if the chat asks for it. Accepted missions wait for your organization to verify them.
3. Open **My record** to see your accepted missions, their status and verified hours.

## 5. Organization verifies the work and creates the certificate

1. Sign in as the organization and open **Org portal**, then the **Verification queue**. Accepted missions from your volunteers appear here.
2. After the work is done, open the mission and enter the **signer's name and role**, the **verified hours**, and a short **description of the student's work** (at least 15 characters; it is printed on the certificate).
3. Click **Verify & issue certificate**. (You can also choose **Could not verify**.)
4. The volunteer opens **My record** and clicks **Download PDF** to get their certificate of completion.

The **Impact** summary then shows verified hours, volunteers and neighbourhoods reached, and the **Report** tab builds a printable report for your team.

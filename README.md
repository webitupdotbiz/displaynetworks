# Display Networks [![MIT license](http://img.shields.io/badge/license-MIT-lightgrey.svg)](http://opensource.org/licenses/MIT)

[Open Source Digital Signage Platform](https://displaynet.works)

## ⚙️ How It Works

1. **Install the Display Networks server**  
   Create an `A` record pointing `yourdomain.com` to your server IP.
   Log in as root into your self-hosted Debian VPS using ssh:
   - Run `setup-server.sh` script to set up server.
   - This configures:
     - Nginx with HTTPS via Let's Encrypt
     - MongoDB
     - The Express API backend
     - PM2 process manager
     - Admin user
     - Unattended updates
     - Fail2ban

2. **Create your content**  
   Build your signage content as either a web page or a list of videos. Publish to the web.

3. **Set up your channel**  
   Log into Display Networks, create a new channel, give it a name, and either:
   - Enter the URL to your hosted content, **or**
   - Paste a list of MP4 video URLs

4. **Deploy your screen(s)**  
   Use the provided `setup-display.sh` to set up displays running Debian, LightDM + Chromium in kiosk mode.  
   Point it to your channel URL.

5. **You're live**  
   Once setup is complete, your screen(s) will display the channel content immediately.

6. **Update anytime, remotely**  
   Log back into Display Networks, edit the channel and change the content URL or video list.  
   All screens on that channel will update automatically—no reconfiguration needed.

---

## 🛠️ Tech Stack

This project uses the [MEAN stack](https://en.wikipedia.org/wiki/MEAN_(software_bundle)):
* **Database:** [MongoDB](https://www.mongodb.com) with [Mongoose.js](http://www.mongoosejs.com)
* **Backend:** [Node.js](https://nodejs.org) + [Express.js](http://expressjs.com)
* **Frontend:** [Angular 2+](https://angular.io) with [Angular CLI](https://cli.angular.io)
* **UI & Styling:** [Bootstrap 5](http://www.getbootstrap.com) & [Font Awesome](http://fontawesome.io)
* **Auth & Security:** [JSON Web Token](https://jwt.io) & [Bcrypt.js](https://github.com/dcodeIO/bcrypt.js)

---

## 🚀 Local Development Setup

### Prerequisites

Ensure you have the following installed locally:
* [Node.js](https://nodejs.org) (v18+ recommended)
* [MongoDB Community Server](https://www.mongodb.com/try/download/community)
* [Angular CLI](https://cli.angular.io):
  ```bash
  npm i -g @angular/cli
  ```

### Installation

1. Clone the repository and navigate to the project root:
   ```bash
   git clone [https://github.com/webitupdotbiz/displaynetworks.git](https://github.com/webitupdotbiz/displaynetworks.git)
   cd displaynetworks
   ```

2. Install all dependencies:
   ```bash
   npm install
   ```

### Running Locally

Ensure your local MongoDB daemon is running, or let the `dev` command initialize it:

```bash
npm run dev
```

This runs `concurrently` to execute:
* MongoDB service (`mongod`)
* Angular CLI dev server with proxy settings (`ng serve --proxy-config proxy.conf.json --open`)
* TypeScript watch compilation for Express (`tsc -w -p server`)
* Nodemon backend supervisor (`nodemon dist/server/app.js`)

Your default browser will automatically open to `http://localhost:4200`. Changes to client or server code will trigger live reloading and server restarts automatically.

---

## 🧪 Testing & Code Quality

Run tests across the client and server components:

```bash
# Run client unit tests
npm run test

# Run server unit tests
npm run test:server

# Run combined test coverage reports
npm run test:coverage

# Run linting checks
npm run lint

# Install Playwright dependencies and execute end-to-end tests
npm run e2e:install
npm run e2e
```

---

## 📦 Production Build

To test or build for production locally:

```bash
# Build both Angular client and Express TypeScript server
npm run build

# Run production server
npm run start
```

---

## 📄 License & Credits

Display Networks is based on [Angular-Full-Stack](https://github.com/DavideViolante/Angular-Full-Stack) by Davide Violante.  
Ongoing development by [Web It Up!](https://webitup.biz)

Display Networks comes with ABSOLUTELY NO WARRANTY, to the extent permitted by applicable law.

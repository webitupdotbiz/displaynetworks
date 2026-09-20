# Display Networks  [![MIT license](http://img.shields.io/badge/license-MIT-lightgrey.svg)](http://opensource.org/licenses/MIT)

Open Source Digital Signage Platform

## ⚙️ How It Works

1. **Install the Display Networks server**  
   On a self-hosted Debian VPS:
   - Create an `A` record pointing `yourdomain.com` to your server IP.
   - Run setup-server.sh script to set up server.
   - This configures:
     - Nginx with HTTPS via Let's Encrypt
     - MongoDB
     - The Express API backend
     - PM2 process manager
     - admin user
     - unattended updates
     - fail2ban

2. **Create your content**  
   Build your signage content as either a web page or a list of videos. Publish to the web

3. **Set up your channel**  
   Log into Display Networks, create a new channel, give it a name, and either:
   - Enter the URL to your hosted content, **or**
   - Paste a list of MP4 video URLs

4. **Deploy your screen(s)**  
   Use the provided setup-display.sh to set up displays
   running Debian, LightDM + Chromium in kiosk mode.  
   Point it to your channel URL.

5. **You're live**  
   Once setup is complete, your screen(s) will display the channel content immediately.

6. **Update anytime, remotely**  
   Log back into Display Networks, edit the channel and change the content URL or video list.  
   All screens on that channel will update automatically - no reconfiguration needed.


The frontend is [Angular CLI](https://github.com/angular/angular-cli). Whole stack in [TypeScript](https://www.typescriptlang.org).

This project uses the [MEAN stack](https://en.wikipedia.org/wiki/MEAN_(software_bundle)):
* [**M**ongoose.js](http://www.mongoosejs.com) ([MongoDB](https://www.mongodb.com)): database
* [**E**xpress.js](http://expressjs.com): backend framework
* [**A**ngular 2+](https://angular.io): frontend framework
* [**N**ode.js](https://nodejs.org): runtime environment

Other tools and technologies used:
* [Angular CLI](https://cli.angular.io): frontend scaffolding
* [Bootstrap](http://www.getbootstrap.com): layout and styles
* [Font Awesome](http://fontawesome.io): icons
* [JSON Web Token](https://jwt.io): user authentication
* [Angular 2 JWT](https://github.com/auth0/angular2-jwt): JWT helper for Angular
* [Bcrypt.js](https://github.com/dcodeIO/bcrypt.js): password encryption

## Prerequisites
1. Install [Node.js](https://nodejs.org) and [MongoDB](https://www.mongodb.com)
2. Install Angular CLI: `npm i -g @angular/cli`
3. From project root folder install all the dependencies: `npm i`

## Run
### Development mode
`npm run dev`: [concurrently](https://github.com/kimmobrunfeldt/concurrently) execute MongoDB, Angular build, TypeScript compiler and Express server.

A window will automatically open at [localhost:4200](http://localhost:4200). Angular and Express files are being watched. Any change automatically creates a new bundle, restart Express server and reload your browser.

Display Networks is based on [Angular-Full-Stack](https://github.com/DavideViolante/Angular-Full-Stack) by Davide Violante.
Ongoing development by [Web It Up!](https://webitup.biz)


Display Networks comes with ABSOLUTELY NO WARRANTY, to the extent permitted by applicable law.

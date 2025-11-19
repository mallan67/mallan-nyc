FROM node:18
WORKDIR /usr/src/app

# copy package.json and install deps (node_modules will be created here)
COPY package*.json ./
RUN npm install

# ensure project-local binaries are on PATH at runtime (and during build steps after this line)
ENV PATH=/usr/src/app/node_modules/.bin:$PATH

# copy rest of the app and build
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]

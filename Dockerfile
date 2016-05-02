FROM hub.psi.unc.edu.ar/base/nodejs:5.11.0

RUN mkdir -p /opt/project
WORKDIR /opt/project

COPY package.json /opt/project/
RUN npm install
COPY index.js /opt/project
COPY v1 /opt/project/v1
CMD ["npm", "start"]

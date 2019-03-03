#! /usr/bin/env bash

ibmcloud fn package create mensa

ibmcloud fn action create mensa/loader src/loader.js --kind nodejs:10
ibmcloud fn action create mensa/db2setup src/db2setup.js --kind nodejs:10
ibmcloud fn action create mensa/commenter src/commenter.js --kind nodejs:10

ibmcloud fn service bind "dashDB For Transactions" mensa/loader --instance mensa_store
ibmcloud fn service bind "dashDB For Transactions" mensa/db2setup --instance mensa_store
ibmcloud fn service bind "dashDB For Transactions" mensa/commenter --instance mensa_store

ibmcloud fn action invoke mensa/db2setup -p mode "[\"setup\"]" -r
ibmcloud fn action invoke mensa/db2setup -p mode "[\"sampledata\"]" -r
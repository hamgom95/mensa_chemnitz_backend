#! /usr/bin/env bash
ibmcloud fn action update mensa/loader src/loader.js --kind nodejs:10
ibmcloud fn action update mensa/db2setup src/db2setup.js --kind nodejs:10
ibmcloud fn action update mensa/commenter src/commenter.js --kind nodejs:10
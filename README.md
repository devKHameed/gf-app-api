# GF public Serverless Backend

## Demo 
https://d258pyik3p724r.cloudfront.net/

## Local Setup

First you need to clone the repo

```bash
git clone git@github.com:devKHameed/gf-app-api.git
```

Change the directory to gf-app-backend-api

```bash
cd gf-app-api
```

Need to install the dependencies with yarn or npm

```bash
yarn
```

or

```bash
npm i
```

Additionally we need to install serverless-offline globally to test it on local

```bash
npm install -g serverless-offline
```

For local testing run

```bash
sls offline
```

For Http Errors

```
        const error = createError(400, 'Event object failed validation')
        error.cause = errors
        throw error
```

For all serverless framework commands you can use `sls | serverless`

## Deploy

Need to configure AWS credentials to directly deploy the application on any AWS account

```bash
sls config credentials --provider "aws" --key "youAccessKey" --secret "YouSecretKey"
```

Then run

```bash
yarn deploy:main --stage dev --aws-profile YOUR_AWS_PROFILE
yarn deploy:fusion --stage dev --aws-profile YOUR_AWS_PROFILE
```

## Additional configurations

**_ Will add steps soon _**

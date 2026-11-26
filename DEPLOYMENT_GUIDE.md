# Library System AWS EC2 Deployment

## Architecture

- React/Vite frontend served by Nginx on port 80
- Express backend on the private Docker network on port 5000
- MongoDB 7 container with the `mongo_data` persistent volume
- Amazon Linux 2023 EC2 instance, `t3.small`, 20 GB gp2 root volume
- CloudFormation provisions the instance and SSH key pair
- GitHub Actions provisions EC2 and deploys on pushes to `main`

The frontend and backend are exposed through Nginx; the backend port is not published publicly.

## GitHub Secrets

Configure these repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `JWT_SECRET`: a long random secret used for authentication tokens
- `EMAIL_USER`: Gmail address used by OTP email
- `EMAIL_PASS`: Gmail application password

Generate a JWT secret with:

```bash
openssl rand -hex 48
```

AWS credentials must belong to an IAM identity allowed to use EC2, CloudFormation, SSM, and related Describe/Get actions in your lab account.

## Deploy

1. Push this project to a GitHub repository whose default deployment branch is `main`.
2. Add the GitHub secrets above.
3. Push to `main` or run **Actions > Deploy Library System to AWS EC2 > Run workflow**.
4. Open the URL printed in the workflow summary. The application is available at `http://<EC2-Public-IP>`.

The CloudFormation stack is named `library-system-production-stack`. EC2 is created with HTTP and SSH open, matching the EduHub lab deployment pattern.

## Persistent Data

MongoDB data is stored in the Docker named volume `mongo_data`. Recreating containers does not delete that volume. Deleting the EC2 instance or stack does delete the data unless the volume is separately backed up.

## Manual Server Deployment

If using an EC2 instance outside GitHub Actions:

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET and Gmail credentials
chmod +x aws/deploy.sh
./aws/deploy.sh
```

Verify health with:

```bash
curl http://localhost/api/health
```
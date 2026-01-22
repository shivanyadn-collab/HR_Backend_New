pipeline {
    agent any

    // This pipeline is triggered by GitHub webhooks
    // Make sure GitHub webhook is configured to POST to: https://jenkins.zenapi.co.in/github-webhook/
    // Content type: application/json
    // Events: Just the push event

    environment {
        IMAGE_NAME = "hr-backend"
        CONTAINER_NAME = "hr-backend"
        HOST_PORT = "3003"
        CONTAINER_PORT = "3000"
    }

    stages {

        stage('Checkout Code') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                sh '''
                docker build --no-cache -t $IMAGE_NAME .
                '''
            }
        }

        stage('Stop Old Container') {
            steps {
                sh '''
                docker stop $CONTAINER_NAME || true
                docker rm $CONTAINER_NAME || true
                '''
            }
        }

        stage('Run New Container') {
            steps {
                sh '''
                docker run -d \
                  --name $CONTAINER_NAME \
                  -p $HOST_PORT:$CONTAINER_PORT \
                  -e DATABASE_URL="postgresql://admin:Efmsiot%40%232025%21@192.168.1.2:5432/hr_admin?schema=public&connection_limit=5&pool_timeout=20" \
                  -e JWT_SECRET="8f1cd53c5fcf27695ae0f13e14ddab11f526542b1ad1277a6ea679c1712e520f" \
                  -e JWT_EXPIRES_IN="7d" \
                  -e PORT=3000 \
                  -e NODE_ENV=development \
                  $IMAGE_NAME
                '''
            }
        }
    }

    post {
        success {
            echo "✅ Backend deployed successfully"
        }
        failure {
            echo "❌ Deployment failed"
        }
    }
}


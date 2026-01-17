pipeline {
    agent any

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
                sh 'docker build -t $IMAGE_NAME .'
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
                -p $HOST_PORT:$CONTAINER_PORT \
                --name $CONTAINER_NAME \
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


@Library('ci-lib') _
pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 20, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '10'))
    disableConcurrentBuilds()
  }

  environment {
    IMAGE_NAME = 'nourki2003/contact-api'
    NPM_CONFIG_CACHE = '/tmp/.npm'

  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.SHORT_SHA = env.GIT_COMMIT.take(7)
        }
        echo "Commit : ${env.GIT_COMMIT} -> tag ${env.SHORT_SHA}"
      }
    }

    stage('Install') {
      agent { docker { image 'node:24-alpine'; reuseNode true } }
      steps {
        sh 'npm ci'
      }
    }

    stage('Quality') {
      parallel {
        stage('Lint') {
          agent { docker { image 'node:24-alpine'; reuseNode true } }
          steps {
            sh 'npm run lint'
          }
        }
        stage('Unit tests') {
          agent { docker { image 'node:24-alpine'; reuseNode true } }
          steps {
            sh 'npx vitest run tests --exclude "tests/integration/**" --reporter=default --reporter=junit --outputFile.junit=reports/junit.xml'
          }
        }
      }
    }

    stage('Build image') {
      steps {
        buildAndPush(image: env.IMAGE_NAME, tag: env.SHORT_SHA)
      }
    }
    stage('Push') {
      when {
        expression { env.BRANCH_NAME == 'main' || env.GIT_BRANCH == 'origin/main' }
      }
      steps {
        buildAndPush(image: env.IMAGE_NAME, tag: env.SHORT_SHA, push: true)
      }
      post {
        always {
          sh 'docker logout || true'
        }
      }
    }
  }

  post {
    always {
      junit testResults: 'reports/*.xml', allowEmptyResults: true
      echo "Build ${currentBuild.fullDisplayName} terminé : ${currentBuild.currentResult}"
    }
    success {
      archiveArtifacts artifacts: 'image.txt', allowEmptyArchive: true, fingerprint: true
    }
    failure {
      echo 'Le pipeline a échoué : consultez les logs du stage en rouge.'
    }
    cleanup {
      cleanWs()
    }
  }
}

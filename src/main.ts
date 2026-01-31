import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'path'
import * as express from 'express'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'


async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  // Increase body size limit for large payloads and file uploads (100MB)
  // If you still get 413, increase your reverse proxy limit (e.g. nginx client_max_body_size)
  app.use(express.json({ limit: '100mb' }))
  app.use(express.urlencoded({ limit: '100mb', extended: true }))

  // Enable CORS
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
    : ['http://localhost:5173', 'http://localhost:4173', 'https://hr.exozen.co.in']

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true)
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      
      // For development: allow any localhost origin
      if (process.env.NODE_ENV !== 'production') {
        const localhostRegex = /^https?:\/\/localhost(:\d+)?$/
        if (localhostRegex.test(origin)) {
          return callback(null, true)
        }
      }
      
      // Reject if not allowed - return false instead of throwing error
      // This prevents 500 errors on OPTIONS preflight requests
      callback(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })

  // Serve static files
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  })

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter())

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  // Global prefix
  app.setGlobalPrefix('api')

  const port = process.env.PORT || 3000
  await app.listen(port)
  console.log(`🚀 Application is running on: http://localhost:${port}/api`)
}

bootstrap()

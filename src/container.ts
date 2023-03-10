/* eslint-disable no-console */
import http, { ServerResponse } from 'http'
import express, { Express } from 'express'
import { register } from './metrics'

export abstract class AppContainer {
  public readonly app: Express = express()

  private state: 'starting' | 'ready' | 'shutdown' | 'unknown'
  private server?: http.Server

  constructor () {
    console.log('starting server')

    this.state = 'starting'

    process.on('SIGTERM', () => { void this.destroy() })
    process.on('SIGINT', () => { void this.destroy() })
    process.on('SIGUSR2', () => { void this.destroy() })
    process.on('SIGHUP', () => { void this.destroy() })

    void this.up().then(() => { void this.initialize() })
  }

  abstract up (): Promise<void>
  abstract down (): Promise<void>
  abstract populate (app: Express): void

  protected async initialize (): Promise<void> {
    this.app.get('/', (_, res) => this.version(res))
    this.app.get('/health', (_, res) => this.liveness(res))
    this.app.get('/ready', (_, res) => this.readiness(res))
    this.app.get('/metrics', (_, res) => this.metrics(res))

    this.populate(this.app)

    this.server = this.app.listen(process.env.PORT ?? 3000, () => {
      console.log('server started')

      this.state = 'ready'
    })
  }

  private async destroy (): Promise<void> {
    console.log('shutting down server')

    this.state = 'shutdown'

    await this.down()

    this.server?.close(() => {
      void this.down().finally(() => {
        console.log('server shutdown')
      })
    })
  }

  private liveness (res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.write('OK')
    res.end()
  }

  private readiness (res: ServerResponse): void {
    if (this.state === 'ready') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.write('OK')
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.write('not OK')
    }

    res.end()
  }

  private metrics (res: ServerResponse): void {
    if (this.state !== 'ready') {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.write('not OK')
      return
    }

    register.metrics()
      .then(string => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.write(string)
      })
      .catch(() => {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.write('not OK')
      })
      .finally(() => {
        res.end()
      })
  }

  private version (res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.write(JSON.stringify({
      env: process.env.NODE_ENV
    }))
    res.end()
  }
}

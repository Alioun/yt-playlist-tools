export type Delivery<Sender> = {
  readonly message: unknown
  readonly sender: Sender
}

export type Receive<Sender> = (delivery: Delivery<Sender>) => Promise<unknown> | undefined

export type Transport<Sender> = {
  send(message: unknown): Promise<unknown>
  listen(receive: Receive<Sender>): () => void
}

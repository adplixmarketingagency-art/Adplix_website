// Screen-space spring: only dots inside the pointer's influence acquire a target offset.
// Returns new state so the projection/physics can be checked without a canvas or DOM.
export function stepDotPhysics(state, baseX, baseY, pointer, dt, radius = 105, scatter = 72) {
  let targetX = 0
  let targetY = 0
  let affected = false

  if (pointer && radius > 0) {
    const dx = baseX - pointer.x
    const dy = baseY - pointer.y
    const distance = Math.hypot(dx, dy)
    if (distance < radius) {
      affected = true
      const falloff = (1 - distance / radius) ** 2
      const directionX = distance > 0.001 ? dx / distance : 1
      const directionY = distance > 0.001 ? dy / distance : 0
      targetX = directionX * scatter * falloff
      targetY = directionY * scatter * falloff
    }
  }

  // Bounded timestep and exponential damping prevent large jumps after a suspended tab.
  const step = Math.max(0, Math.min(dt, 0.05))
  const damping = Math.exp(-15 * step)
  const velocityX = (state.velocityX + (targetX - state.offsetX) * 105 * step) * damping
  const velocityY = (state.velocityY + (targetY - state.offsetY) * 105 * step) * damping
  let offsetX = state.offsetX + velocityX * step
  let offsetY = state.offsetY + velocityY * step

  // Snap tiny residuals to rest rather than running subpixel spring motion forever.
  if (!affected && Math.abs(offsetX) + Math.abs(offsetY) + Math.abs(velocityX) + Math.abs(velocityY) < 0.02) {
    offsetX = 0
    offsetY = 0
    return { offsetX, offsetY, velocityX: 0, velocityY: 0, affected, displacement: 0 }
  }
  return { offsetX, offsetY, velocityX, velocityY, affected, displacement: Math.hypot(offsetX, offsetY) }
}

import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="home-page">
      <div className="home-content">
        <h1 className="home-title">PixelForge</h1>
        <p className="home-subtitle">图片风格化 & 3D 粒子动画</p>

        <div className="home-links">
          <Link to="/2d" className="home-link">
            <div className="home-link-card">
              <div className="home-link-icon">🎨</div>
              <div className="home-link-title">2D 图片风格化</div>
              <div className="home-link-desc">WebGL shader 实时图片处理</div>
            </div>
          </Link>

          <Link to="/3d" className="home-link">
            <div className="home-link-card">
              <div className="home-link-icon">🎭</div>
              <div className="home-link-title">3D 粒子动画</div>
              <div className="home-link-desc">GLTF 模型粒子特效</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

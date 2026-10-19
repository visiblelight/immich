<div class="map-legend">
  <span><i></i>去过</span>
  <span><i class="empty"></i>尚未留下照片</span>
  <span class="hint">拖动 · 双指缩放</span>
</div>

<style>
  .map-legend {
    display: flex;
    align-items: center;
    gap: 19px;
    font-size: 11px;
    color: #556d65;
    pointer-events: none;
  }
  span {
    display: flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }
  i {
    width: 11px;
    height: 11px;
    box-sizing: border-box;
    background: #dfac59;
    border: 1px solid #83958b;
  }
  .empty { background: #fffdf7; }
  @media (max-width: 700px) {
    .map-legend { gap: 16px; }
    .hint { display: none; }
  }
</style>

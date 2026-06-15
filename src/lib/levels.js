export const levels = [
  {
    id: 1,
    name: '关卡1：单个三角形 - 面积计算',
    category: '基础验证',
    description: '给定三节点坐标，计算三角形面积并验证',
    type: 'manual',
    data: {
      nodes: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 10, y: 0 },
        { id: 2, x: 5, y: 8 }
      ],
      questions: [
        { field: 'area', label: '三角形面积 A (mm²)', answer: 40, tolerance: 0.5 }
      ]
    },
    unlockCondition: '答案误差 < 1%'
  },
  {
    id: 2,
    name: '关卡2：B矩阵构造',
    category: '基础验证',
    description: '根据三节点坐标计算形函数系数和B矩阵',
    type: 'manual',
    data: {
      nodes: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 4, y: 0 },
        { id: 2, x: 0, y: 3 }
      ],
      questions: [
        { field: 'b1', label: 'b1 = y2 - y3', answer: -3, tolerance: 0.01 },
        { field: 'b2', label: 'b2 = y3 - y1', answer: 3, tolerance: 0.01 },
        { field: 'b3', label: 'b3 = y1 - y2', answer: 0, tolerance: 0.01 },
        { field: 'c1', label: 'c1 = x3 - x2', answer: -4, tolerance: 0.01 },
        { field: 'c2', label: 'c2 = x1 - x3', answer: 0, tolerance: 0.01 },
        { field: 'c3', label: 'c3 = x2 - x1', answer: 4, tolerance: 0.01 }
      ]
    },
    unlockCondition: '所有系数正确'
  },
  {
    id: 3,
    name: '关卡3：D矩阵与单元刚度',
    category: '基础验证',
    description: '给定E=200GPa, ν=0.3，计算平面应力D矩阵并求Ke(1,1)',
    type: 'manual',
    data: {
      material: { E: 200e9, nu: 0.3 },
      nodes: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 0.02, y: 0 },
        { id: 2, x: 0, y: 0.02 }
      ],
      thickness: 0.01,
      questions: [
        { field: 'D11', label: 'D11 (Pa)', answer: 2.1978e11, tolerance: 1e9, relative: true },
        { field: 'Ke11', label: 'Ke[0][0] (N/m)', answer: 1.0989e9, tolerance: 1e7, relative: true }
      ]
    },
    unlockCondition: '矩阵元素误差 < 5%'
  },
  {
    id: 4,
    name: '关卡4：矩形梁 - 2单元装配',
    category: '简单装配',
    description: '使用两个三角形单元组成矩形，完成装配过程',
    type: 'guided',
    data: {
      template: 'rect',
      params: { width: 4, height: 2 },
      meshSize: 2,
      constraints: [{ edge: 'left', type: 'fixed' }],
      loads: [{ node: 'topRight', Fx: 0, Fy: -1000 }],
      expectedMaxDisp: 0.001,
      tolerance: 0.1
    },
    unlockCondition: '完成建模-装配-求解，位移误差 < 10%'
  },
  {
    id: 5,
    name: '关卡5：4单元梁的应力分析',
    category: '简单装配',
    description: '使用更细的网格分析梁的应力分布',
    type: 'guided',
    data: {
      template: 'rect',
      params: { width: 8, height: 2 },
      meshSize: 2,
      constraints: [{ edge: 'left', type: 'fixed' }],
      loads: [{ edge: 'right', type: 'distributed', value: -100, direction: 'y' }],
      expectedMaxStress: 120,
      tolerance: 0.15
    },
    unlockCondition: '最大应力误差 < 15%'
  },
  {
    id: 6,
    name: '关卡6：网格收敛初探',
    category: '简单装配',
    description: '使用不同密度网格验证结果收敛性',
    type: 'guided',
    data: {
      template: 'rect',
      params: { width: 10, height: 1 },
      requiredRuns: 3,
      sizes: [1, 0.5, 0.25],
      constraints: [{ edge: 'left', type: 'fixed' }],
      loads: [{ node: 'rightEnd', Fx: 0, Fy: -500 }],
      expectedConvergence: true
    },
    unlockCondition: '完成3次计算并展示收敛趋势'
  },
  {
    id: 7,
    name: '关卡7：悬臂梁 - 解析解对比',
    category: '经典结构',
    description: '端部受集中力的悬臂梁，与材料力学解析解对比',
    type: 'analysis',
    data: {
      template: 'rect',
      params: { width: 1000, height: 100 },
      meshSize: 50,
      material: { E: 200e9, nu: 0.3 },
      thickness: 10,
      constraints: [{ edge: 'left', type: 'fixed' }],
      loads: [{ edge: 'right', type: 'distributed', value: -1000, direction: 'y' }],
      analyticSolution: {
        maxDeflection: 'PL³/(3EI)',
        maxBendingStress: 'M*c/I'
      },
      tolerance: 0.1
    },
    unlockCondition: '挠度/应力误差 < 10%'
  },
  {
    id: 8,
    name: '关卡8：简支梁受均布载荷',
    category: '经典结构',
    description: '简支梁受均布载荷，验证中点挠度',
    type: 'analysis',
    data: {
      template: 'rect',
      params: { width: 2000, height: 200 },
      meshSize: 80,
      material: { E: 200e9, nu: 0.3 },
      thickness: 20,
      constraints: [
        { edge: 'leftBottom', type: 'pinned' },
        { edge: 'rightBottom', type: 'roller' }
      ],
      loads: [{ edge: 'top', type: 'distributed', value: -500, direction: 'y' }],
      tolerance: 0.12
    },
    unlockCondition: '中点挠度误差 < 12%'
  },
  {
    id: 9,
    name: '关卡9：轴向受压柱',
    category: '经典结构',
    description: '验证轴向压缩的均匀应力场',
    type: 'analysis',
    data: {
      template: 'rect',
      params: { width: 100, height: 500 },
      meshSize: 40,
      material: { E: 200e9, nu: 0.3 },
      thickness: 10,
      constraints: [{ edge: 'bottom', type: 'fixed' }],
      loads: [{ edge: 'top', type: 'distributed', value: -1000, direction: 'y' }],
      tolerance: 0.05
    },
    unlockCondition: '应力均匀性误差 < 5%'
  },
  {
    id: 10,
    name: '关卡10：纯弯曲梁',
    category: '经典结构',
    description: '验证纯弯曲的线性应力分布',
    type: 'analysis',
    data: {
      template: 'rect',
      params: { width: 800, height: 100 },
      meshSize: 30,
      material: { E: 200e9, nu: 0.3 },
      thickness: 10,
      constraints: [{ edge: 'left', type: 'fixed' }],
      loads: [
        { edge: 'topRight', type: 'concentrated', Fx: 0, Fy: 1000 },
        { edge: 'bottomRight', type: 'concentrated', Fx: 0, Fy: -1000 }
      ],
      tolerance: 0.08
    },
    unlockCondition: '应力线性度R² > 0.95'
  },
  {
    id: 11,
    name: '关卡11：带中心圆孔的受拉板',
    category: '复杂结构',
    description: '分析应力集中现象，计算应力集中系数',
    type: 'full',
    data: {
      template: 'plateWithHole',
      params: { width: 200, height: 100, holeX: 100, holeY: 50, holeR: 15 },
      meshSize: 12,
      material: { E: 200e9, nu: 0.3 },
      thickness: 10,
      constraints: [{ edge: 'left', type: 'fixed' }],
      loads: [{ edge: 'right', type: 'distributed', value: 100, direction: 'x' }],
      tolerance: 0.2
    },
    unlockCondition: '完成全流程，应力集中系数接近理论值3'
  },
  {
    id: 12,
    name: '关卡12：L形支架',
    category: '复杂结构',
    description: 'L形角支架受载荷，分析拐角应力',
    type: 'full',
    data: {
      template: 'lshape',
      params: { w1: 200, h1: 200, w2: 50, h2: 50 },
      meshSize: 15,
      constraints: [{ edge: 'left', type: 'fixed' }],
      loads: [{ point: { x: 200, y: 50 }, Fx: 0, Fy: -5000 }],
      tolerance: 0.15
    },
    unlockCondition: '完成全流程建模-网格-求解'
  },
  {
    id: 13,
    name: '关卡13：I形截面梁',
    category: '复杂结构',
    description: '工字钢梁的弯曲分析',
    type: 'full',
    data: {
      template: 'ishape',
      params: { H: 200, B: 100, tf: 15, tw: 8 },
      meshSize: 12,
      constraints: [
        { edge: 'bottomLeft', type: 'pinned' },
        { edge: 'bottomRight', type: 'roller' }
      ],
      loads: [{ edge: 'topFlange', type: 'distributed', value: -200, direction: 'y' }],
      tolerance: 0.15
    },
    unlockCondition: '完成全流程分析'
  },
  {
    id: 14,
    name: '关卡14：带孔耳板',
    category: '复杂结构',
    description: '销钉连接耳板的接触应力简化分析',
    type: 'full',
    data: {
      template: 'custom',
      hint: '请绘制一个矩形板，在一侧绘制圆形孔（螺栓孔），固定孔内边界，在对边施加拉力',
      tolerance: 0.2
    },
    unlockCondition: '独立完成建模-分析，网格平均质量 > 0.6'
  },
  {
    id: 15,
    name: '关卡15：桥梁截面优化',
    category: '复杂结构',
    description: '箱型桥梁截面的综合设计与分析',
    type: 'full',
    data: {
      template: 'custom',
      hint: '设计一个带内部加劲肋的箱型截面，施加弯曲和剪切载荷，验证应力分布合理性',
      requiredMetrics: {
        minQuality: 0.5,
        convergence: true
      }
    },
    unlockCondition: '综合评分：网格质量+收敛性+正确求解'
  }
];

export function getLevelById(id) {
  return levels.find(l => l.id === id);
}

export function getNextLevel(id) {
  const idx = levels.findIndex(l => l.id === id);
  return idx >= 0 && idx < levels.length - 1 ? levels[idx + 1] : null;
}

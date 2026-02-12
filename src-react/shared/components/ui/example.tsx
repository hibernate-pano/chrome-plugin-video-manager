/**
 * shadcn/ui 组件使用示例
 *
 * 这个文件展示了如何使用已安装的 shadcn/ui 组件
 * 可以作为开发参考，也可以用于测试组件是否正常工作
 */

import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'

/**
 * 组件使用示例
 */
export function ComponentExample() {
  return (
    <div className="p-8 space-y-8">
      {/* Button 示例 */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Button 组件</h2>
        <div className="flex gap-2">
          <Button>默认按钮</Button>
          <Button variant="secondary">次要按钮</Button>
          <Button variant="destructive">危险按钮</Button>
          <Button variant="outline">轮廓按钮</Button>
          <Button variant="ghost">幽灵按钮</Button>
          <Button variant="link">链接按钮</Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm">小按钮</Button>
          <Button size="default">默认按钮</Button>
          <Button size="lg">大按钮</Button>
        </div>
      </div>

      {/* Input 和 Label 示例 */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Input 和 Label 组件</h2>
        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
          <Input id="email" type="email" placeholder="请输入邮箱" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <Input id="password" type="password" placeholder="请输入密码" />
        </div>
      </div>

      {/* Tabs 示例 */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Tabs 组件</h2>
        <Tabs defaultValue="tab1" className="w-full">
          <TabsList>
            <TabsTrigger value="tab1">标签页 1</TabsTrigger>
            <TabsTrigger value="tab2">标签页 2</TabsTrigger>
            <TabsTrigger value="tab3">标签页 3</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">
            <div className="p-4 border rounded-md">
              <h3 className="text-lg font-semibold mb-2">标签页 1 内容</h3>
              <p>这是第一个标签页的内容。</p>
            </div>
          </TabsContent>
          <TabsContent value="tab2">
            <div className="p-4 border rounded-md">
              <h3 className="text-lg font-semibold mb-2">标签页 2 内容</h3>
              <p>这是第二个标签页的内容。</p>
            </div>
          </TabsContent>
          <TabsContent value="tab3">
            <div className="p-4 border rounded-md">
              <h3 className="text-lg font-semibold mb-2">标签页 3 内容</h3>
              <p>这是第三个标签页的内容。</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

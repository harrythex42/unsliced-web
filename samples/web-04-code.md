# 工具使用说明：整理值班记录

这里用小段 Python 演示如何整理活动记录。原始数据只包含站点和状态，不包含读者个人资料。请留意代码块是否完整、中文字符串能否复制。

```python
from collections import Counter

records = [
    {"station": "河畔", "status": "已核对"},
    {"station": "青榆", "status": "待复查"},
    {"station": "望山", "status": "已核对"},
]

def count_by_status(records):
    """按状态统计每条值班记录。"""
    return Counter(row["status"] for row in records)

if __name__ == "__main__":
    for status, number in count_by_status(records).items():
        print(f"{status}: {number}")
```

## 如何读结果

`Counter` 接收一串状态，并返回每种状态的次数。`待复查` 不代表有故障，只说明值班人员还没完成第二次检查。

```text
已核对: 2
待复查: 1
```

## 把结果转成便于查阅的表

这一段包含长行：在较窄的页面里允许折到下一行，但不能裁掉内容。

```python
columns = ("station", "status", "updated_at", "review_by", "previous_status", "public_note", "internal_flag")
title = "春季试点汇总 / Spring pilot operations and reading room audit"

def show_summary(title, columns, rows):
    print(title)
    print(" | ".join(columns))
    for row in rows:
        print(" | ".join(str(row.get(field, "未填写")) for field in columns))
```

## 最后一步

把临时表和需要复查的项目分别存放，后续只将已核对信息写入月报。页尾搜索词：代码块检查结束。

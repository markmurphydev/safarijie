//
//  Result.swift
//  Safarikai
//
//  Created by James Chen on 2016/12/06.
//  Copyright © 2016 ashchan.com. All rights reserved.
//

import Foundation

public struct Result {
    let hanzi, pinyin, translation: String

    public func toJSON() -> [String: String] {
        return [
            "hanzi": hanzi,
            "pinyin": pinyin,
            "translation": translation,
        ]
    }
}

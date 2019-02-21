"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const vscode_uri_1 = require("vscode-uri");
const gt = require("./types");
const utils_1 = require("../compiler/utils");
const utils_2 = require("./utils");
const scanner_1 = require("./scanner");
const printer_1 = require("./printer");
const binder_1 = require("./binder");
const utils_3 = require("../service/utils");
let nextSymbolId = 1;
let nextNodeId = 1;
const printer = new printer_1.Printer();
function getNodeId(node) {
    if (!node.id) {
        node.id = nextNodeId;
        nextNodeId++;
    }
    return node.id;
}
exports.getNodeId = getNodeId;
function getSymbolId(symbol) {
    if (!symbol.id) {
        symbol.id = nextSymbolId;
        nextSymbolId++;
    }
    return symbol.id;
}
exports.getSymbolId = getSymbolId;
var CheckMode;
(function (CheckMode) {
    CheckMode[CheckMode["Normal"] = 0] = "Normal";
    CheckMode[CheckMode["SkipContextSensitive"] = 1] = "SkipContextSensitive";
})(CheckMode || (CheckMode = {}));
class AbstractType {
    isValidBinaryOperation(operation, rightType) {
        return false;
    }
    isValidPrefixOperation(operation) {
        return false;
    }
    isValidPostfixOperation(operation) {
        return false;
    }
    getName() {
        return this.constructor.name;
    }
}
exports.AbstractType = AbstractType;
class UnknownType extends AbstractType {
    constructor() {
        super(...arguments);
        this.flags = 1 /* Unknown */;
    }
    isAssignableTo(target) {
        return false;
    }
    isComparableTo(target) {
        return false;
    }
    isBoolExpression(negation) {
        return false;
    }
}
exports.UnknownType = UnknownType;
class IntrinsicType extends AbstractType {
    constructor(flags, name) {
        super();
        this.flags = flags;
        this.name = name;
    }
    isAssignableTo(target) {
        if (this === target)
            return true;
        if (target instanceof IntrinsicType) {
            if (target.flags & 32 /* Fixed */ && (this.flags & 4 /* Integer */ || this.flags & 8 /* Byte */))
                return true;
            if (target.flags & 4 /* Integer */ && (this.flags & 8 /* Byte */))
                return true;
            if (target.flags & 8 /* Byte */ && (this.flags & 4 /* Integer */))
                return true;
            if (this.flags & 64 /* Boolean */ && target.flags & 64 /* Boolean */)
                return true;
        }
        if (this.flags & 4096 /* Null */ && target.flags & 128 /* Nullable */)
            return true;
        return false;
    }
    isComparableTo(target) {
        if (this === target)
            return true;
        if (target instanceof IntrinsicType) {
            if ((this.flags & 4 /* Integer */ || this.flags & 8 /* Byte */ || this.flags & 32 /* Fixed */) &&
                (target.flags & 4 /* Integer */ || target.flags & 8 /* Byte */ || target.flags & 32 /* Fixed */)) {
                return true;
            }
            if (this.flags & 64 /* Boolean */ && target.flags & 64 /* Boolean */)
                return true;
        }
        if (this.flags & 4096 /* Null */ && target.flags & 128 /* Nullable */)
            return true;
        return false;
    }
    isBoolExpression(negation) {
        return true;
    }
    isValidBinaryOperation(operation, rightType) {
        if (this === rightType || (rightType instanceof LiteralType && rightType.value.kind === 3 /* StringLiteral */)) {
            switch (operation) {
                case 20 /* PlusToken */:
                    if (this.flags & 2 /* String */)
                        return true;
            }
        }
        if (this === rightType ||
            (rightType.flags & 4 /* Integer */) ||
            (rightType.flags & 32 /* Fixed */) ||
            (rightType.flags & 8 /* Byte */) ||
            (rightType instanceof LiteralType && rightType.value.kind === 2 /* NumericLiteral */)) {
            switch (operation) {
                case 20 /* PlusToken */:
                case 21 /* MinusToken */:
                case 22 /* AsteriskToken */:
                case 24 /* PercentToken */:
                case 23 /* SlashToken */:
                    if (this.flags & 4 /* Integer */ || this.flags & 8 /* Byte */ || this.flags & 32 /* Fixed */)
                        return true;
            }
        }
        if (this === rightType || (rightType instanceof LiteralType && rightType.value.kind === 2 /* NumericLiteral */)) {
            switch (operation) {
                case 29 /* AmpersandToken */:
                case 30 /* BarToken */:
                case 31 /* CaretToken */:
                case 27 /* LessThanLessThanToken */:
                case 28 /* GreaterThanGreaterThanToken */:
                case 35 /* BarBarToken */:
                case 34 /* AmpersandAmpersandToken */:
                    if (this.flags & 4 /* Integer */)
                        return true;
            }
        }
        return false;
    }
    isValidPrefixOperation(operation) {
        switch (operation) {
            case 20 /* PlusToken */:
            case 21 /* MinusToken */:
                if (this.flags & 4 /* Integer */ || this.flags & 8 /* Byte */ || this.flags & 32 /* Fixed */)
                    return true;
            case 33 /* TildeToken */:
                if (this.flags & 4 /* Integer */ || this.flags & 8 /* Byte */)
                    return true;
            case 32 /* ExclamationToken */:
                if (this.flags & 4 /* Integer */ || this.flags & 8 /* Byte */ || this.flags & 32 /* Fixed */ || this.flags & 64 /* Boolean */ || this.flags & 2 /* String */)
                    return true;
        }
    }
    isValidPostfixOperation(operation) {
        return false;
    }
    getName() {
        return this.name;
    }
}
exports.IntrinsicType = IntrinsicType;
class ComplexType extends AbstractType {
    constructor(kind) {
        super();
        this.flags = 32768 /* Complex */;
        this.kind = kind;
        switch (this.kind) {
            case 83 /* ColorKeyword */:
                break;
            default:
                this.flags |= 128 /* Nullable */;
                break;
        }
    }
    get extendsHandle() {
        switch (this.kind) {
            case 76 /* AbilcmdKeyword */:
            case 77 /* ActorKeyword */:
            case 78 /* ActorscopeKeyword */:
            case 79 /* AifilterKeyword */:
            case 80 /* BankKeyword */:
            case 81 /* BitmaskKeyword */:
            case 82 /* CamerainfoKeyword */:
            case 84 /* DatetimeKeyword */:
            case 87 /* GenerichandleKeyword */:
            case 88 /* EffecthistoryKeyword */:
            case 89 /* MarkerKeyword */:
            case 90 /* OrderKeyword */:
            case 91 /* PlayergroupKeyword */:
            case 92 /* PointKeyword */:
            case 93 /* RegionKeyword */:
            case 95 /* SoundKeyword */:
            case 96 /* SoundlinkKeyword */:
            case 97 /* TextKeyword */:
            case 98 /* TimerKeyword */:
            case 99 /* TransmissionsourceKeyword */:
            case 102 /* UnitfilterKeyword */:
            case 103 /* UnitgroupKeyword */:
            case 104 /* UnitrefKeyword */:
            case 107 /* WaveinfoKeyword */:
            case 108 /* WavetargetKeyword */:
                return true;
            default:
                return false;
        }
    }
    isAssignableTo(target) {
        if (this === target)
            return true;
        if (target instanceof ComplexType) {
            if (target.kind === 86 /* HandleKeyword */)
                return this.extendsHandle;
            if (this.kind === 86 /* HandleKeyword */)
                return target.extendsHandle;
        }
        // if (target.flags && gt.TypeFlags.Null && this.flags & gt.TypeFlags.Nullable) return true;
        return false;
    }
    isComparableTo(target) {
        if (this === target)
            return true;
        if (target.flags && 4096 /* Null */ && this.flags & 128 /* Nullable */)
            return true;
        return false;
    }
    isBoolExpression(negation) {
        if (negation) {
            switch (this.kind) {
                case 100 /* TriggerKeyword */:
                case 101 /* UnitKeyword */:
                    return false;
            }
        }
        return true;
    }
    isValidBinaryOperation(operation, rightType) {
        if (this !== rightType)
            return false;
        switch (operation) {
            case 20 /* PlusToken */:
                {
                    switch (this.kind) {
                        case 97 /* TextKeyword */:
                        case 92 /* PointKeyword */:
                            return true;
                    }
                    break;
                }
            case 21 /* MinusToken */:
                {
                    switch (this.kind) {
                        case 92 /* PointKeyword */:
                            return true;
                    }
                    break;
                }
        }
        return false;
    }
    isValidPrefixOperation(operation) {
        switch (operation) {
            case 32 /* ExclamationToken */:
                return this.isBoolExpression(true);
        }
        return false;
    }
    getName() {
        return scanner_1.tokenToString(this.kind);
    }
}
exports.ComplexType = ComplexType;
class LiteralType extends AbstractType {
    constructor(flags, value) {
        super();
        this.flags = flags;
        this.value = value;
    }
    isAssignableTo(target) {
        if (this === target)
            return true;
        if (this.value.kind === 3 /* StringLiteral */ && target.flags & 2 /* String */) {
            return true;
        }
        if (this.value.kind === 2 /* NumericLiteral */ && (target.flags & 8 /* Byte */ ||
            target.flags & 4 /* Integer */ ||
            target.flags & 32 /* Fixed */)) {
            if (this.value.text.indexOf('.') !== -1 && !(target.flags & 32 /* Fixed */)) {
                return false;
            }
            return true;
        }
        if (this.flags & 4096 /* Null */ && target.flags & 128 /* Nullable */) {
            return true;
        }
        return false;
    }
    isComparableTo(target) {
        if (this === target)
            return true;
        if (this.value.kind === 2 /* NumericLiteral */ && (target.flags & 8 /* Byte */ ||
            target.flags & 4 /* Integer */ ||
            target.flags & 32 /* Fixed */)) {
            return true;
        }
        if (target instanceof LiteralType && this.value.kind === target.value.kind)
            return true;
        return this.isAssignableTo(target);
    }
    isBoolExpression(negation) {
        return true;
    }
    isValidBinaryOperation(operation, rightType) {
        let type;
        if (this.value.kind === 2 /* NumericLiteral */) {
            if (this.value.text.indexOf('.') !== -1) {
                type = fixedType;
            }
            else {
                type = integerType;
            }
        }
        else if (this.value.kind === 3 /* StringLiteral */) {
            type = stringType;
        }
        else {
            return false;
        }
        return type.isValidBinaryOperation(operation, rightType);
    }
    isValidPrefixOperation(operation) {
        let type;
        if (this.value.kind === 2 /* NumericLiteral */) {
            if (this.value.text.indexOf('.') !== -1) {
                type = fixedType;
            }
            else {
                type = integerType;
            }
        }
        else if (this.value.kind === 3 /* StringLiteral */) {
            type = stringType;
        }
        else {
            return false;
        }
        return type.isValidPrefixOperation(operation);
    }
    getName() {
        return `${this.value.text}`;
    }
}
exports.LiteralType = LiteralType;
class StructType extends AbstractType {
    constructor(symbol) {
        super();
        this.flags = 8192 /* Struct */;
        this.symbol = symbol;
    }
    isAssignableTo(target) {
        if (target instanceof ReferenceType && target.kind === 110 /* StructrefKeyword */ && this.symbol === target.declaredType.symbol) {
            return true;
        }
        return false;
    }
    isComparableTo(target) {
        if (this === target)
            return true;
        if (target instanceof StructType && target.symbol === this.symbol)
            return true;
        return false;
    }
    isBoolExpression(negation) {
        return false;
    }
    getName() {
        return this.symbol.escapedName;
    }
}
exports.StructType = StructType;
class SignatureMeta {
    constructor(returnType, args) {
        this.returnType = returnType;
        this.args = args;
    }
    match(other) {
        if (this.returnType !== other.returnType)
            return false;
        if (this.args.length !== other.args.length)
            return false;
        for (const [key, arg] of this.args.entries()) {
            if (this.args[key] !== arg)
                return false;
        }
        return true;
    }
    toString() {
        const params = [];
        for (const p of this.args) {
            params.push(p.getName());
        }
        return `${this.returnType.getName()} (${params.join(',')})`;
    }
}
exports.SignatureMeta = SignatureMeta;
class FunctionType extends AbstractType {
    constructor(symbol, signature) {
        super();
        this.flags = 16384 /* Function */;
        this.symbol = symbol;
        this.signature = signature;
    }
    isAssignableTo(target) {
        if (target instanceof ReferenceType && target.kind === 111 /* FuncrefKeyword */) {
            if (!(target.declaredType.flags & 16384 /* Function */))
                return false;
            if (this.symbol === target.declaredType.symbol)
                return true;
            if (this.signature.match(target.declaredType.signature))
                return true;
        }
        return false;
    }
    isComparableTo(target) {
        if (this === target)
            return true;
        if (target instanceof FunctionType && target.symbol === this.symbol)
            return true;
        return false;
    }
    isBoolExpression(negation) {
        if (negation)
            return false;
        return true;
    }
    getName() {
        return this.symbol.escapedName;
    }
}
exports.FunctionType = FunctionType;
class ReferenceType extends AbstractType {
    constructor(kind, declaredType) {
        super();
        this.flags = 262144 /* Reference */;
        this.kind = kind;
        this.declaredType = declaredType;
    }
    isAssignableTo(target) {
        if (target instanceof ReferenceType && this.kind === target.kind) {
            return this.declaredType.isAssignableTo(this);
        }
        return false;
    }
    isComparableTo(target) {
        return false;
    }
    isBoolExpression(negation) {
        return false;
    }
    getName() {
        return scanner_1.tokenToString(this.kind) + '<' + this.declaredType.getName() + '>';
    }
}
exports.ReferenceType = ReferenceType;
class ArrayType extends AbstractType {
    constructor(elementType) {
        super();
        this.flags = 65536 /* Array */;
        this.elementType = elementType;
    }
    isAssignableTo(target) {
        if (target instanceof ReferenceType && target.kind === 109 /* ArrayrefKeyword */) {
            if (this.elementType === target.declaredType.elementType)
                return true;
        }
    }
    isComparableTo(target) {
        return false;
    }
    isBoolExpression(negation) {
        return false;
    }
    getName() {
        return this.elementType.getName() + '[]';
    }
}
exports.ArrayType = ArrayType;
class TypedefType extends AbstractType {
    constructor(referencedType) {
        super();
        this.flags = 2097152 /* Typedef */;
        this.referencedType = referencedType;
    }
    isAssignableTo(target) {
        return false;
    }
    isComparableTo(target) {
        return false;
    }
    isBoolExpression(negation) {
        return false;
    }
    getName() {
        return this.referencedType.getName();
    }
}
exports.TypedefType = TypedefType;
function createSymbol(flags, name) {
    const symbol = {
        flags: flags,
        escapedName: name,
    };
    return symbol;
}
const unknownType = new UnknownType();
const nullType = new IntrinsicType(4096 /* Null */ | 128 /* Nullable */, "null");
const boolType = new IntrinsicType(64 /* Boolean */, "bool");
const trueType = new IntrinsicType(64 /* Boolean */, "true");
const falseType = new IntrinsicType(64 /* Boolean */, "false");
const stringType = new IntrinsicType(2 /* String */ | 128 /* Nullable */, "string");
const integerType = new IntrinsicType(4 /* Integer */, "integer");
const byteType = new IntrinsicType(8 /* Byte */, "byte");
const fixedType = new IntrinsicType(32 /* Fixed */, "fixed");
const voidType = new IntrinsicType(2048 /* Void */, "void");
const complexTypes = generateComplexTypes();
function generateComplexTypes() {
    const map = new Map();
    for (let i = 76 /* FirstComplexType */; i <= 108 /* LastComplexType */; i++) {
        const ckind = i;
        map.set(ckind, new ComplexType(ckind));
    }
    return map;
}
class TypeChecker {
    constructor(store) {
        this.nodeLinks = [];
        this.diagnostics = new Map();
        this.currentSymbolContainer = null;
        this.currentDocuments = new Map();
        this.store = store;
        this.currentDocuments = this.store.documents;
    }
    report(location, msg, category = gt.DiagnosticCategory.Error) {
        const d = utils_2.createDiagnosticForNode(location, category, msg);
        const c = this.diagnostics.get(d.file.fileName);
        if (c)
            c.push(d);
    }
    getNodeLinks(node) {
        const nodeId = getNodeId(node);
        return this.nodeLinks[nodeId] || (this.nodeLinks[nodeId] = { flags: 0 });
    }
    checkTypeAssignableTo(source, target, node) {
        // TODO: error when using local var as reference
        if (source === unknownType || target === unknownType)
            return;
        if (!source.isAssignableTo(target)) {
            this.report(node, 'Type \'' + source.getName() + '\' is not assignable to type \'' + target.getName() + '\'');
        }
    }
    checkTypeComparableTo(source, target, node) {
        if (source === unknownType || target === unknownType)
            return;
        if (!source.isComparableTo(target)) {
            this.report(node, 'Type \'' + source.getName() + '\' is not comparable to type \'' + target.getName() + '\'');
        }
    }
    checkTypeBoolExpression(source, negation, node) {
        if (source === unknownType)
            return;
        if (!source.isBoolExpression(negation)) {
            this.report(node, 'Type \'' + source.getName() + '\' can not be used as boolean expression');
        }
    }
    getTypeFromArrayTypeNode(node) {
        const links = this.getNodeLinks(node);
        if (!links.resolvedType) {
            links.resolvedType = new ArrayType(this.getTypeFromTypeNode(node.elementType));
        }
        return links.resolvedType;
    }
    getTypeFromMappedTypeNode(node) {
        const links = this.getNodeLinks(node);
        if (!links.resolvedType) {
            links.resolvedType = new ReferenceType(node.returnType.kind, node.typeArguments.length ? this.getTypeFromTypeNode(node.typeArguments[0]) : unknownType);
        }
        return links.resolvedType;
    }
    resolveMappedReference(type) {
        if (type.flags & 262144 /* Reference */) {
            type = type.declaredType;
        }
        return type;
    }
    getPropertyOfType(type, name) {
        if (type && type.flags & 8192 /* Struct */) {
            if (type.symbol.members.has(name)) {
                return type.symbol.members.get(name);
            }
        }
    }
    getDeclaredTypeOfStruct(symbol) {
        // TODO: persist in map<symbol,type>
        return new StructType(symbol);
    }
    getSignatureOfFunction(fnDecl) {
        return new SignatureMeta(this.getTypeFromTypeNode(fnDecl.type), fnDecl.parameters.map((param) => {
            return this.getTypeFromTypeNode(param.type);
        }));
    }
    getTypeOfFunction(symbol) {
        const fnDecl = symbol.declarations[0];
        // TODO: persist in map<symbol,type>
        return new FunctionType(symbol, this.getSignatureOfFunction(fnDecl));
    }
    getTypeOfTypedef(symbol) {
        const refType = this.getTypeFromTypeNode(symbol.declarations[0].type);
        return new TypedefType(refType);
    }
    getDeclaredTypeOfSymbol(symbol) {
        if (symbol.flags & (64 /* Struct */)) {
            return this.getDeclaredTypeOfStruct(symbol);
        }
        else if (symbol.flags & (14 /* Variable */)) {
            return this.getTypeOfSymbol(symbol);
        }
        else if (symbol.flags & (32 /* Function */)) {
            // should we introduce SignatureType that describes fn declaration and return it instead?
            return this.getTypeOfFunction(symbol);
        }
        else if (symbol.flags & (128 /* Typedef */)) {
            return this.getTypeFromTypeNode(symbol.declarations[0].type);
        }
        return unknownType;
    }
    getTypeFromTypeNode(node) {
        switch (node.kind) {
            case 75 /* StringKeyword */:
                return stringType;
            case 73 /* IntKeyword */:
                return integerType;
            case 71 /* ByteKeyword */:
                return byteType;
            case 74 /* FixedKeyword */:
                return fixedType;
            case 70 /* BoolKeyword */:
                return boolType;
            case 105 /* VoidKeyword */:
                return voidType;
            case 68 /* NullKeyword */:
                return nullType;
            // case gt.SyntaxKind.LiteralType:
            //     return getTypeFromLiteralTypeNode(<LiteralTypeNode>node);
            case 116 /* ArrayType */:
                return this.getTypeFromArrayTypeNode(node);
            case 115 /* MappedType */:
                return this.getTypeFromMappedTypeNode(node);
            case 112 /* Identifier */:
                const symbol = this.getSymbolAtLocation(node);
                if (symbol) {
                    return this.getDeclaredTypeOfSymbol(symbol);
                }
                else {
                    return unknownType;
                }
            default:
                if (utils_1.isComplexTypeKind(node.kind)) {
                    return complexTypes.get(node.kind);
                }
                return unknownType;
        }
    }
    getTypeOfSymbol(symbol) {
        if (symbol.flags & (14 /* Variable */ | 16 /* Property */)) {
            return this.getTypeOfVariableOrParameterOrProperty(symbol);
        }
        else if (symbol.flags & (32 /* Function */)) {
            return this.getTypeOfFunction(symbol);
        }
        else if (symbol.flags & (128 /* Typedef */)) {
            return this.getTypeOfTypedef(symbol);
        }
        return unknownType;
    }
    getTypeOfVariableOrParameterOrProperty(symbol) {
        return this.getTypeFromTypeNode(symbol.declarations[0].type);
    }
    getTypeOfNode(node, followRef = false) {
        // TODO:
        // if (isPartOfTypeNode(node)) {
        //     return this.getTypeFromTypeNode(<TypeNode>node);
        // }
        if (utils_2.isPartOfExpression(node)) {
            let type = this.getRegularTypeOfExpression(node);
            if (followRef) {
                type = this.resolveMappedReference(type);
            }
            return type;
        }
        return unknownType;
    }
    getRegularTypeOfExpression(expr) {
        return this.getTypeOfExpression(expr);
    }
    getTypeOfExpression(node, cache) {
        return this.checkExpression(node);
    }
    checkSourceFile(sourceFile, bindSymbols = false) {
        this.diagnostics.clear();
        this.diagnostics.set(sourceFile.fileName, []);
        this.currentDocuments = this.store.documents;
        if (bindSymbols) {
            this.currentSymbolContainer = binder_1.declareSymbol(sourceFile, { resolveGlobalSymbol: this.resolveGlobalSymbol.bind(this) }, null);
        }
        sourceFile.statements.forEach(this.checkSourceElement.bind(this));
        return Array.from(this.diagnostics.values()).pop();
    }
    checkSourceFileRecursivelyWorker(sourceFile) {
        binder_1.unbindSourceFile(sourceFile, { resolveGlobalSymbol: this.resolveGlobalSymbol.bind(this) });
        this.currentSymbolContainer = binder_1.declareSymbol(sourceFile, { resolveGlobalSymbol: this.resolveGlobalSymbol.bind(this) }, null);
        this.diagnostics.set(sourceFile.fileName, []);
        this.currentDocuments.set(sourceFile.fileName, sourceFile);
        for (const statement of sourceFile.statements) {
            if (statement.kind === 134 /* IncludeStatement */) {
                const docUri = this.checkIncludeStatement(statement);
                if (docUri && !this.currentDocuments.has(docUri)) {
                    const inclFile = this.store.documents.get(docUri);
                    if (inclFile) {
                        const currentSymbolContainer = this.currentSymbolContainer;
                        this.checkSourceFileRecursivelyWorker(inclFile);
                        this.currentSymbolContainer = currentSymbolContainer;
                    }
                }
                continue;
            }
            this.checkSourceElement(statement);
        }
    }
    checkSourceFileRecursively(sourceFile) {
        this.diagnostics.clear();
        this.currentDocuments = new Map();
        if (this.store.s2workspace) {
            const coreMod = this.store.s2workspace.allArchives.find((archive) => archive.name === 'mods/core.sc2mod');
            if (coreMod) {
                const fsp = path.join(coreMod.directory, 'base.sc2data', 'TriggerLibs', 'natives_missing.galaxy');
                const smNatives = this.store.documents.get(vscode_uri_1.default.file(fsp).toString());
                if (smNatives) {
                    this.checkSourceFileRecursivelyWorker(smNatives);
                }
            }
        }
        this.checkSourceFileRecursivelyWorker(sourceFile);
        return {
            success: Array.from(this.diagnostics.values()).findIndex((value, index) => value.length > 0) === -1,
            diagnostics: this.diagnostics,
        };
    }
    checkSourceElement(node) {
        let prevSymbolContainer = null;
        if (this.currentSymbolContainer && utils_2.isDeclarationKind(node.kind)) {
            prevSymbolContainer = this.currentSymbolContainer;
            this.currentSymbolContainer = binder_1.declareSymbol(node, { resolveGlobalSymbol: this.resolveGlobalSymbol.bind(this) }, prevSymbolContainer);
            if (this.currentSymbolContainer.declarations.length > 1) {
                let previousDeclaration;
                if (node.kind === 140 /* FunctionDeclaration */) {
                    for (const pd of this.currentSymbolContainer.declarations) {
                        if (pd === node)
                            continue;
                        if (pd.kind === 140 /* FunctionDeclaration */ && (!pd.body || !node.body)) {
                            continue;
                        }
                        previousDeclaration = pd;
                        break;
                    }
                }
                else if (node.kind === 141 /* ParameterDeclaration */) {
                    for (const pd of this.currentSymbolContainer.declarations) {
                        if (pd === node)
                            continue;
                        if (pd.parent !== node.parent)
                            continue;
                        previousDeclaration = pd;
                        break;
                    }
                }
                else {
                    previousDeclaration = this.currentSymbolContainer.declarations[this.currentSymbolContainer.declarations.length - 2];
                }
                if (previousDeclaration) {
                    const prevSourceFile = utils_2.findAncestorByKind(previousDeclaration, 126 /* SourceFile */);
                    const prevPos = utils_3.getLineAndCharacterOfPosition(prevSourceFile, previousDeclaration.pos);
                    this.report(node.name, `Symbol redeclared, previous declaration in ${prevSourceFile.fileName}:${prevPos.line + 1},${prevPos.character + 1}`);
                }
            }
        }
        switch (node.kind) {
            case 134 /* IncludeStatement */:
                this.checkIncludeStatement(node);
                break;
            case 127 /* Block */:
                this.checkBlock(node);
                break;
            case 140 /* FunctionDeclaration */:
                this.checkFunction(node);
                break;
            case 139 /* VariableDeclaration */:
            case 142 /* PropertyDeclaration */:
                this.checkVariableDeclaration(node);
                break;
            case 141 /* ParameterDeclaration */:
                this.checkParameterDeclaration(node);
                break;
            case 138 /* StructDeclaration */:
                this.checkStructDeclaration(node);
                break;
            case 136 /* ExpressionStatement */:
                this.checkExpressionStatement(node);
                break;
            case 128 /* IfStatement */:
                this.checkIfStatement(node);
                break;
            case 131 /* ForStatement */:
                this.checkForStatement(node);
                break;
            case 130 /* WhileStatement */:
            case 129 /* DoStatement */:
                this.checkWhileStatement(node);
                break;
            case 132 /* BreakStatement */:
            case 133 /* ContinueStatement */:
                this.checkBreakOrContinueStatement(node);
                break;
            case 135 /* ReturnStatement */:
                this.checkReturnStatement(node);
                break;
            case 115 /* MappedType */:
                this.checkMappedType(node);
                break;
            case 116 /* ArrayType */:
                this.checkArrayType(node);
                break;
            case 112 /* Identifier */:
                this.checkIdentifier(node);
                break;
        }
        if (prevSymbolContainer) {
            this.currentSymbolContainer = prevSymbolContainer;
        }
    }
    checkIncludeStatement(node) {
        const path = node.path.value.replace(/\.galaxy$/i, '').toLowerCase();
        for (const docUri of this.store.documents.keys()) {
            const meta = this.store.getDocumentMeta(docUri);
            if (!meta.relativeName)
                continue;
            if (meta.relativeName.toLowerCase() != path)
                continue;
            const sourceFile = utils_2.findAncestorByKind(node, 126 /* SourceFile */);
            if (this.store.documents.get(docUri) === sourceFile) {
                this.report(node.path, `Self-include`, gt.DiagnosticCategory.Warning);
                return;
            }
            return docUri;
        }
        this.report(node.path, `Given filename couldn't be matched`);
    }
    checkFunction(node) {
        this.checkSourceElement(node.type);
        const currentSignature = this.getSignatureOfFunction(node);
        for (const prevDecl of node.symbol.declarations) {
            if (node === prevDecl)
                continue;
            if (prevDecl.kind !== 140 /* FunctionDeclaration */)
                break;
            const previousSignature = this.getSignatureOfFunction(prevDecl);
            if (!currentSignature.match(previousSignature)) {
                this.report(node, `Function signature doesn't match it's previous declaration '${previousSignature.toString()}'`);
                break;
            }
        }
        node.parameters.forEach(this.checkSourceElement.bind(this));
        if (node.body && node.body.kind === 127 /* Block */) {
            const rtype = this.getTypeFromTypeNode(node.type);
            this.checkBlock(node.body);
            if (!(rtype.flags & 2048 /* Void */) && !node.body.hasReturn) {
                this.report(node.name, 'Expected return statement');
            }
        }
    }
    checkParameterDeclaration(node) {
        this.checkSourceElement(node.type);
        const type = this.getTypeFromTypeNode(node.type);
        if (type instanceof StructType || type instanceof FunctionType) {
            this.report(node.type, 'Can only pass basic types');
        }
    }
    checkVariableDeclaration(node) {
        this.checkSourceElement(node.type);
        this.checkIdentifier(node.name, true);
        if (node.initializer) {
            const varType = this.getTypeFromTypeNode(node.type);
            const exprType = this.checkExpression(node.initializer);
            this.checkTypeAssignableTo(exprType, varType, node.initializer);
        }
    }
    checkStructDeclaration(node) {
        node.members.forEach(this.checkSourceElement.bind(this));
    }
    checkIfStatement(node) {
        const exprType = this.checkExpression(node.expression);
        this.checkTypeBoolExpression(exprType, false, node.expression);
        this.checkSourceElement(node.thenStatement);
        if (node.elseStatement) {
            this.checkSourceElement(node.elseStatement);
            node.hasReturn = node.thenStatement.hasReturn && node.elseStatement.hasReturn;
        }
    }
    checkForStatement(node) {
        if (node.initializer) {
            this.checkExpression(node.initializer);
        }
        if (node.condition) {
            const exprType = this.checkExpression(node.condition);
            this.checkTypeBoolExpression(exprType, false, node.condition);
        }
        if (node.incrementor) {
            this.checkExpression(node.incrementor);
        }
        this.checkSourceElement(node.statement);
    }
    checkWhileStatement(node) {
        if (node.expression) {
            const exprType = this.checkExpression(node.expression);
            this.checkTypeBoolExpression(exprType, false, node.expression);
        }
        this.checkSourceElement(node.statement);
    }
    checkBreakOrContinueStatement(node) {
        const loop = utils_2.findAncestor(node, (parent) => {
            switch (parent.kind) {
                case 131 /* ForStatement */:
                case 130 /* WhileStatement */:
                case 129 /* DoStatement */:
                    return true;
            }
            return false;
        });
        if (!loop) {
            this.report(node, `${scanner_1.tokenToString(node.syntaxTokens[0].kind)} statement used outside of loop boundaries`);
        }
    }
    checkReturnStatement(node) {
        const fn = utils_2.findAncestorByKind(node, 140 /* FunctionDeclaration */);
        const rtype = this.getTypeFromTypeNode(fn.type);
        if (rtype.flags & 2048 /* Void */ && node.expression) {
            this.report(node, 'Unexpected value returned for void function');
        }
        else if (!(rtype.flags & 2048 /* Void */) && !node.expression) {
            this.report(node, 'Expected a return value');
        }
        if (node.expression) {
            const exprType = this.checkExpression(node.expression);
            this.checkTypeAssignableTo(exprType, rtype, node.expression);
        }
    }
    checkArrayType(node) {
        this.checkExpression(node.size);
        this.checkSourceElement(node.elementType);
    }
    checkMappedType(node) {
        if (!utils_2.isReferenceKeywordKind(node.returnType.kind)) {
            this.report(node.returnType, 'Invalid keyword for reference type provided - use funcref, arrayref or structref');
        }
        if (node.typeArguments.length !== 1) {
            this.report(node, 'Expected exactly 1 argument');
        }
        node.typeArguments.forEach(this.checkSourceElement.bind(this));
        if (node.typeArguments.length > 0) {
            const type = this.getTypeFromMappedTypeNode(node);
            let invalid = false;
            switch (type.kind) {
                case 110 /* StructrefKeyword */:
                    invalid = !(type.declaredType.flags & 8192 /* Struct */);
                    break;
                case 111 /* FuncrefKeyword */:
                    invalid = !(type.declaredType.flags & 16384 /* Function */);
                    break;
                case 109 /* ArrayrefKeyword */:
                    invalid = !(type.declaredType.flags & 65536 /* Array */);
                    break;
            }
            if (invalid) {
                this.report(node, 'Type \'' + type.declaredType.getName() + '\' is not a valid reference for \'' + scanner_1.tokenToString(node.returnType.kind) + '\'');
            }
        }
    }
    checkBlock(node) {
        let returnFound = false;
        let returnFoundExplict = false;
        node.statements.forEach((child) => {
            this.checkSourceElement(child);
            switch (child.kind) {
                case 135 /* ReturnStatement */:
                    returnFoundExplict = returnFound = true;
                    break;
                case 128 /* IfStatement */:
                    // if (returnFoundExplict === true) break;
                    returnFound = child.hasReturn;
                    break;
            }
        });
        node.hasReturn = returnFound;
    }
    checkExpressionStatement(node) {
        this.checkExpression(node.expression);
    }
    checkExpression(node, checkMode) {
        return this.checkExpressionWorker(node, checkMode);
    }
    checkExpressionWorker(node, checkMode) {
        switch (node.kind) {
            case 112 /* Identifier */:
                return this.checkIdentifier(node);
            case 68 /* NullKeyword */:
                return nullType;
            case 3 /* StringLiteral */:
            case 2 /* NumericLiteral */:
            case 66 /* TrueKeyword */:
            case 67 /* FalseKeyword */:
                return this.checkLiteralExpression(node);
            case 119 /* PropertyAccessExpression */:
                return this.checkPropertyAccessExpression(node);
            case 118 /* ElementAccessExpression */:
                return this.checkIndexedAccess(node);
            case 120 /* CallExpression */:
                return this.checkCallExpression(node);
            case 125 /* ParenthesizedExpression */:
                return this.checkParenthesizedExpression(node, checkMode);
            case 121 /* PrefixUnaryExpression */:
                return this.checkPrefixUnaryExpression(node);
            case 122 /* PostfixUnaryExpression */:
                return this.checkPostfixUnaryExpression(node);
            case 123 /* BinaryExpression */:
                return this.checkBinaryExpression(node, checkMode);
        }
        return unknownType;
    }
    checkLiteralExpression(node) {
        switch (node.kind) {
            case 3 /* StringLiteral */:
                return new LiteralType(256 /* StringLiteral */, node);
            case 2 /* NumericLiteral */:
                return new LiteralType(512 /* NumericLiteral */, node);
            case 66 /* TrueKeyword */:
                return trueType;
            case 67 /* FalseKeyword */:
                return falseType;
        }
    }
    checkBinaryExpression(node, checkMode) {
        const leftType = this.checkExpression(node.left);
        const rightType = this.checkExpression(node.right);
        if (utils_2.isAssignmentOperator(node.operatorToken.kind)) {
            this.checkTypeAssignableTo(rightType, leftType, node.right);
        }
        else if (utils_2.isComparisonOperator(node.operatorToken.kind)) {
            this.checkTypeComparableTo(rightType, leftType, node.right);
            return boolType;
        }
        else if (node.operatorToken.kind === 35 /* BarBarToken */ || node.operatorToken.kind === 34 /* AmpersandAmpersandToken */) {
            this.checkTypeAssignableTo(leftType, boolType, node.left);
            this.checkTypeAssignableTo(rightType, boolType, node.right);
            return boolType;
        }
        else {
            const valid = leftType.isValidBinaryOperation(node.operatorToken.kind, rightType);
            if (!valid) {
                this.report(node, `Binary '${scanner_1.tokenToString(node.operatorToken.kind)}' operation not supported between '${leftType.getName()}' type and '${rightType.getName()}' type`);
            }
        }
        return leftType;
    }
    checkParenthesizedExpression(node, checkMode) {
        return this.checkExpression(node.expression);
    }
    checkPrefixUnaryExpression(node, checkMode) {
        const type = this.checkExpression(node.operand);
        if (!type.isValidPrefixOperation(node.operator.kind)) {
            this.report(node, `Prefix '${scanner_1.tokenToString(node.operator.kind)}' operation not supported for '${type.getName()}' type`);
        }
        return type;
    }
    checkPostfixUnaryExpression(node, checkMode) {
        return this.checkExpression(node.operand);
    }
    checkIdentifier(node, checkSymbol = false) {
        const symbol = this.getSymbolOfEntityNameOrPropertyAccessExpression(node);
        if (!symbol) {
            this.report(node, `Undeclared symbol: '${node.name}'`);
            return unknownType;
        }
        if (checkSymbol && (symbol.flags & 6 /* FunctionScopedVariable */)) {
            const globalSym = this.resolveName(null, node.name);
            if (globalSym && (globalSym.flags & 32 /* Function */)) {
                this.report(node, `Name clash for '${node.name}'. Name already in use in global scope.`);
            }
        }
        if ((symbol.flags & 1024 /* Static */)) {
            const sourceFile = utils_2.findAncestorByKind(node, 126 /* SourceFile */);
            if (symbol.parent && symbol.parent.declarations[0] !== sourceFile) {
                this.report(node, `Attempting to reference symbol with static modifier outside the scope of its definition.`);
            }
        }
        return this.getTypeOfSymbol(symbol);
    }
    checkCallExpression(node) {
        const leftType = this.checkExpression(node.expression);
        let returnType = leftType;
        let func;
        if (leftType != unknownType) {
            let fnType = leftType;
            if (fnType.flags & 262144 /* Reference */) {
                fnType = this.resolveMappedReference(fnType);
            }
            if (fnType.flags & 16384 /* Function */) {
                func = fnType.symbol.declarations[0];
                if (node.arguments.length !== func.parameters.length) {
                    this.report(node, `Expected ${func.parameters.length} arguments, got ${node.arguments.length}`);
                }
                returnType = this.getTypeFromTypeNode(func.type);
            }
            else {
                this.report(node, `Type '${fnType.getName()}' is not calllable`);
                returnType = unknownType;
            }
        }
        if (func) {
            for (const [key, arg] of node.arguments.entries()) {
                const exprType = this.checkExpression(arg);
                if (func.parameters.length > key) {
                    const expectedType = this.getTypeFromTypeNode(func.parameters[key].type);
                    this.checkTypeAssignableTo(exprType, expectedType, arg);
                }
            }
        }
        return returnType;
    }
    checkIndexedAccess(node) {
        let objectType = this.checkExpression(node.expression);
        const indexType = this.checkExpression(node.argumentExpression);
        if (!(indexType.flags & 4 /* Integer */) && !(indexType.flags & 512 /* NumericLiteral */)) {
            this.report(node.argumentExpression, 'Array index require an integer value');
        }
        if (objectType.flags & 262144 /* Reference */) {
            objectType = this.resolveMappedReference(objectType);
        }
        if (objectType.flags & 65536 /* Array */) {
            return objectType.elementType;
        }
        else {
            this.report(node, 'Index access on non-array type');
        }
        return unknownType;
    }
    checkPropertyAccessExpression(node) {
        let type = this.checkExpression(node.expression);
        type = this.resolveMappedReference(type);
        if (!(type.flags & 8192 /* Struct */)) {
            this.report(node.name, 'Cannot access property on \'' + type.getName() + '\' type');
        }
        else {
            const prop = this.getPropertyOfType(type, node.name.name);
            if (prop) {
                this.getNodeLinks(node).resolvedSymbol = prop;
                const propType = this.getTypeOfSymbol(prop);
                return propType;
            }
            else {
                this.report(node.name, 'Undeclared property');
            }
        }
        return unknownType;
    }
    resolveName(location, name) {
        if (location) {
            const currentContext = utils_2.findAncestor(location, (element) => {
                return element.kind === 140 /* FunctionDeclaration */ || element.kind === 138 /* StructDeclaration */;
            });
            if (currentContext && currentContext.symbol.members.has(name)) {
                return currentContext.symbol.members.get(name);
            }
            const sourceFile = utils_2.findAncestorByKind(location, 126 /* SourceFile */);
            if (sourceFile.symbol.members.has(name)) {
                return sourceFile.symbol.members.get(name);
            }
        }
        return this.resolveGlobalSymbol(name);
    }
    resolveGlobalSymbol(name) {
        for (const document of this.currentDocuments.values()) {
            const symbol = document.symbol.members.get(name);
            if (symbol) {
                return symbol;
            }
        }
        return undefined;
    }
    resolveEntityName(entityName, meaning, ignoreErrors, location) {
        let symbol;
        if (entityName.kind === 112 /* Identifier */) {
            symbol = this.resolveName(location || entityName, entityName.name);
            if (!symbol) {
                return undefined;
            }
        }
        return symbol;
    }
    getSymbolOfEntityNameOrPropertyAccessExpression(entityName) {
        if (utils_2.isRightSideOfPropertyAccess(entityName)) {
            entityName = entityName.parent;
        }
        if (entityName.kind === 112 /* Identifier */) {
            return this.resolveEntityName(entityName, null, false);
        }
        else if (entityName.kind === 119 /* PropertyAccessExpression */) {
            const links = this.getNodeLinks(entityName);
            if (links.resolvedSymbol) {
                return links.resolvedSymbol;
            }
            this.checkPropertyAccessExpression(entityName).symbol;
            return links.resolvedSymbol;
        }
    }
    getSymbolAtLocation(node) {
        switch (node.kind) {
            case 112 /* Identifier */:
            case 119 /* PropertyAccessExpression */:
                return this.getSymbolOfEntityNameOrPropertyAccessExpression(node);
        }
    }
}
exports.TypeChecker = TypeChecker;
//# sourceMappingURL=checker.js.map